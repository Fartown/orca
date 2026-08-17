// 目标状态的磁盘持久化。状态刻意放在 worktree 之外,agent 改不到自己的验收配置。
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { isProcessAlive } from './detached-driver.mjs'

export const ROOT = process.env.ORCA_GOAL_HOME || path.join(os.homedir(), '.orca-goal')

const goalsDir = () => path.join(ROOT, 'goals')
const logDir = () => path.join(ROOT, 'log')
const lockDir = () => path.join(ROOT, 'lock')

/**
 * 目标按**工作区**标识,不按终端。
 *
 * 原来的键是终端 handle(`term_<uuid>`),那是一个标签页的会话 id:
 * 关掉标签页记录就指向一个不存在的东西,而且没有重新绑定的路径。
 * 更要命的是锁也跟着按标签页发 —— 同一个工作区开两个标签页各起一个目标,
 * 两个驱动会同时改同一批文件,而空转熔断、变更取证、验收缓存全靠 git 树哈希,
 * 会把对方的改动算成自己的。实测过一台机器上同一目录挂着 6 个终端。
 *
 * 需要独占的是「哪个工作区正在被改」,所以键从路径来,终端降级成
 * 「此刻往哪儿灌字」的可替换字段(见 rebind)。
 *
 * 只用 path.resolve 归一化,不走 realpath:realpath 依赖目录当下存在,
 * 工作区被删之后就算不出同一个键,连 forget 都做不到。代价是软链别名
 * 会被当成两个工作区 —— 可预期,且比原来按标签页强得多。
 */
export function goalKey(worktreePath) {
  const raw = String(worktreePath ?? '').trim()
  if (!raw) {
    throw new Error('工作区路径不能为空')
  }
  let full = path.resolve(raw).replace(/[/\\]+$/, '') || path.sep
  if (process.platform === 'darwin' || process.platform === 'win32') {
    full = full.toLowerCase() // 这两个平台默认大小写不敏感,不折叠会算出两个键
  }
  // 目录名给人看,哈希保证唯一 —— 只用目录名会撞(到处都有 client/、docs/),
  // 只用哈希则 ls ~/.orca-goal/goals 时完全读不出是哪个项目。
  const label = (path.basename(full) || 'root').replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 32)
  const hash = createHash('sha256').update(full).digest('hex').slice(0, 10)
  return `${label === '.' || label === '..' ? 'root' : label}-${hash}`
}

export const goalPath = (key) => path.join(goalsDir(), `${key}.json`)
export const logPath = (key) => path.join(logDir(), `${key}.jsonl`)

export function newGoal({
  key,
  objective,
  onBlocked = 'ask',
  worktreePath,
  terminalHandle,
  acceptance,
  budget,
  promptFile,
  now
}) {
  return {
    version: 1,
    key,
    objective,
    worktreePath,
    terminalHandle,
    acceptance, // { commands: string[], timeoutMs, cwd }
    budget, // { maxTurns, maxMinutes }
    onBlocked, // 'ask' 停下叫人(默认)| 'verify' 先跑一次验收核实
    promptFile: Boolean(promptFile), // 提示词落文件、只注入一行指针
    state: 'active', // active | complete | blocked | budget_exhausted | stalled | aborted
    turns: 0,
    falseClaims: 0,
    blockedClaims: 0,
    stallCount: 0,
    tamperFindings: [], // 削弱验收的痕迹,跨轮累积
    tamperChallenges: 0,
    startedAt: now,
    // 真正花掉的时间:逐轮累加,驱动没跑的时候不计。
    // 不能用 startedAt 起的墙钟当预算 —— 那样目标停着、驱动崩着也在扣,
    // 停一晚上第二天接回来预算就没了,而它其实一分钟活都没干。
    activeMs: 0,
    updatedAt: now,
    lastSnapshot: null,
    lastCursor: null,
    roundMarker: null,
    finishedAt: null,
    finishReason: null
  }
}

export async function readGoal(key) {
  try {
    return JSON.parse(await fs.readFile(goalPath(key), 'utf8'))
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null
    }
    throw err
  }
}

/**
 * 先写临时文件再 rename —— 崩在半路也不会留下截断的 JSON。
 *
 * updatedAt 在这里盖章,不交给调用方。它原来只在 decide() 里设,于是任何不经过
 * decide 的落盘都留着旧时间戳 —— 实测预算耗尽走的是循环里的直接落盘,记录写在
 * 09:56,updatedAt 却停在前一轮注入的 22:11,差了 11 小时。面板算陈旧度只看这个字段,
 * 于是任何已结束的目标都会被显示得比实际更旧。
 *
 * @param {boolean} touch false 用于「搬文件」这类行政写入(迁移、归档):
 *   那不是新进展,盖章会毁掉「谁更新」这个信息 —— 迁移正是靠它裁决谁占工作区键的。
 */
export async function writeGoal(goal, { touch = true } = {}) {
  await fs.mkdir(goalsDir(), { recursive: true })
  const target = goalPath(goal.key)
  const tmp = `${target}.${process.pid}.tmp`
  const body = touch ? { ...goal, updatedAt: Date.now() } : goal
  await fs.writeFile(tmp, `${JSON.stringify(body, null, 2)}\n`, 'utf8')
  await fs.rename(tmp, target)
  return body
}

export async function deleteGoal(key) {
  await fs.rm(goalPath(key), { force: true })
}

export async function listGoals() {
  let names
  try {
    names = await fs.readdir(goalsDir())
  } catch (err) {
    if (err.code === 'ENOENT') {
      return []
    }
    throw err
  }
  const goals = await Promise.all(
    names.filter((n) => n.endsWith('.json')).map((n) => readGoal(n.slice(0, -5)))
  )
  return goals.filter(Boolean)
}

/** 一个目标的全部侧车文件,迁移和删除都要照顾到。 */
function sidecarsOf(key) {
  return [
    goalPath(key),
    logPath(key),
    path.join(logDir(), `${key}.out`),
    path.join(lockDir(), `${key}.lock`),
    path.join(ROOT, 'claims', `${key}.txt`)
  ]
}

/**
 * 把一个目标的所有文件从 from 键搬到 to 键。
 *
 * 除了固定名字的那几个,还要扫一遍 log/ 里所有以 from 键开头的文件 ——
 * 同一个键上重开目标时 archiveLog 会留下 `<键>.jsonl.<时间>`,而那是上一代
 * 全部轮次的唯一记录。第一版只搬固定名字,实测把唯一记着两次验收判决的
 * 归档日志落在了老键上,跟任何记录都对不上号。
 */
async function renameAll(from, to) {
  const extras = await fs
    .readdir(logDir())
    .then((names) =>
      names.filter((n) => n.startsWith(`${from}.`)).map((n) => path.join(logDir(), n))
    )
    .catch(() => [])
  for (const src of [...sidecarsOf(from), ...extras]) {
    const dst = path.join(path.dirname(src), path.basename(src).replace(from, to))
    if (src === dst) {
      continue
    }
    await fs.rename(src, dst).catch((err) => {
      if (err.code !== 'ENOENT') {
        throw err
      }
    })
  }
  await renameVerdicts(from, to)
}

/**
 * 一个目标的逐轮日志有几代。
 *
 * 同一个键上重开目标时 archiveLog 把上一代改名成 `<键>.jsonl.<时间>`,
 * 而在此之前没有任何东西读得到它们、也无从知道它们存在 —— 我自己因此连续两轮
 * 读当代日志(验收字段全空)就断言「验收从没跑过」,而记录就在上一代那份里。
 *
 * 返回从新到旧,第一项是当代。
 */
export async function listLogGenerations(key) {
  const live = logPath(key)
  const out = []
  if (
    await fs.stat(live).then(
      () => true,
      () => false
    )
  ) {
    out.push({ file: live, current: true, archivedAt: null })
  }
  const names = await fs.readdir(logDir()).catch(() => [])
  const prefix = `${path.basename(live)}.`
  for (const name of names.filter((n) => n.startsWith(prefix))) {
    const stamp = Number(name.slice(prefix.length))
    if (Number.isFinite(stamp)) {
      out.push({ file: path.join(logDir(), name), current: false, archivedAt: stamp })
    }
  }
  return out.sort((a, b) => (b.archivedAt ?? Infinity) - (a.archivedAt ?? Infinity))
}

/**
 * 把按终端 handle 命名的老记录改成按工作区命名。
 *
 * 每条 CLI 命令入口都跑一次:键换了之后,老记录用新键查不到,
 * 于是 stop / resume / forget 全部找不到人,而记录还在磁盘上、面板照旧显示它 ——
 * 看得见摸不着是最难排查的状态。
 *
 * 一个工作区只能有一个活记录 —— 这正是换键要达到的效果。而按终端命名的时代
 * 允许同一目录并存多条(实测同一个 markdown 目录下挂着 6 个终端、存着 2 条记录),
 * 所以迁移必须裁决:**最近更新的那条占住工作区键,其余归档。**
 *
 * 裁决规则必须是确定的。第一版按 readdir 顺序搬,谁先被读到谁占键 ——
 * 实测里更旧的那条(08-15)抢到了键,而人真正想接回的是更新的那条(08-16)。
 *
 * 归档而不是删除:那是用户几十轮的历史和判词。改名到 `<键>.superseded-<时间>`,
 * 让它退出活跃命名空间但仍然列得出来。
 *
 * 驱动还活着的工作区整组跳过 —— 它正拿着这些文件的路径,抽掉就等于把它弄瞎。
 */
export async function migrateLegacyKeys() {
  const groups = new Map()
  for (const goal of await listGoals()) {
    if (!goal.worktreePath || /\.superseded-\d+$/.test(goal.key)) {
      continue // 没记工作区的算不出键;已归档的不再参与裁决
    }
    let key
    try {
      key = goalKey(goal.worktreePath)
    } catch {
      continue
    }
    groups.set(key, [...(groups.get(key) ?? []), goal])
  }

  const moved = []
  for (const [key, members] of groups) {
    if (members.length === 1 && members[0].key === key) {
      continue // 已经在位,没事可做
    }
    const live = await Promise.all(members.map((g) => readLockPid(g.key).then(isProcessAlive)))
    if (live.some(Boolean)) {
      continue
    }
    // 最近更新的占键。同一时刻(更新时间缺失)时按键名兜底,保证顺序稳定可重现。
    const ranked = [...members].sort(
      (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) || a.key.localeCompare(b.key)
    )
    for (const goal of ranked.slice(1)) {
      const archived = `${key}.superseded-${goal.updatedAt || 0}`
      if (goal.key === archived) {
        continue
      }
      await renameAll(goal.key, archived)
      await writeGoal({ ...goal, key: archived }, { touch: false })
      await fs.rm(goalPath(goal.key), { force: true })
      moved.push({ from: goal.key, to: archived, archived: true })
    }
    const owner = ranked[0]
    if (owner.key !== key) {
      await renameAll(owner.key, key)
      await writeGoal({ ...owner, key }, { touch: false })
      await fs.rm(goalPath(owner.key), { force: true })
      moved.push({ from: owner.key, to: key })
    }
  }
  return moved
}

async function renameVerdicts(from, to) {
  const dir = path.join(ROOT, 'verdict')
  let names
  try {
    names = await fs.readdir(dir)
  } catch {
    return
  }
  for (const name of names.filter((n) => n.startsWith(`${from}-turn`))) {
    await fs.rename(path.join(dir, name), path.join(dir, name.replace(from, to))).catch(() => {}) // 判词是留档,搬不动不该拦住迁移
  }
}

/**
 * 同一个终端再开一个新目标时,把上一代的逐轮日志改名归档。
 * 不归档的话新目标的轮次直接追加在旧目标后面,面板读日志尾部就会把上一代的轮次
 * 混进这一代的时间线,轮次号也跟着对不上。
 */
export async function archiveLog(key) {
  const from = logPath(key)
  try {
    await fs.rename(from, `${from}.${Date.now()}`)
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err
    }
  }
}

export async function appendLog(key, entry) {
  await fs.mkdir(logDir(), { recursive: true })
  await fs.appendFile(logPath(key), `${JSON.stringify(entry)}\n`, 'utf8')
}

/** 独占锁:同一个目标只能有一个驱动进程。'wx' 创建失败即已被占用。 */
export async function acquireLock(key) {
  await fs.mkdir(lockDir(), { recursive: true })
  const file = path.join(lockDir(), `${key}.lock`)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await fs.open(file, 'wx')
      await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: Date.now() }))
      await handle.close()
      return { file, release: () => fs.rm(file, { force: true }) }
    } catch (err) {
      if (err.code !== 'EEXIST') {
        throw err
      }
      if (attempt === 1) {
        break
      }
      if (!(await isLockStale(file))) {
        break
      }
      await fs.rm(file, { force: true }) // 持有者已死,回收后重试一次
    }
  }
  const holder = await fs.readFile(file, 'utf8').catch(() => '?')
  throw new Error(`目标 ${key} 已有驱动进程在跑 (${holder.trim()})。先停掉它,或删除 ${file}`)
}

/** 锁文件里记着驱动进程的 pid,status/stop/watch 都靠它判断驱动还在不在。 */
export async function readLockPid(key) {
  try {
    const { pid } = JSON.parse(await fs.readFile(path.join(lockDir(), `${key}.lock`), 'utf8'))
    return Number.isInteger(pid) ? pid : null
  } catch {
    return null
  }
}

async function isLockStale(file) {
  try {
    const { pid } = JSON.parse(await fs.readFile(file, 'utf8'))
    if (!Number.isInteger(pid)) {
      return true
    }
    process.kill(pid, 0)
    return false
  } catch (err) {
    return err.code === 'ESRCH' || err instanceof SyntaxError || err.code === 'ENOENT'
  }
}
