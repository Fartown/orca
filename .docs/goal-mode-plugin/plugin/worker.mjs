// 目标模式插件的 worker,在独立进程里跑(纯 Node,没有 Electron),首次触发时才 fork。
// 契约见 src/main/plugins/plugin-host-runtime.ts 的 PluginWorkerOrcaApi。
//
// 刻意不把看门狗循环写在这里。宿主对 worker 有三条硬限制:空闲 5 分钟回收、
// 事件回调超 5 分钟 SIGKILL、命令处理器 30 秒超时。而一轮 agent 工作动辄十几分钟、
// 一次验收可能跑四十分钟 —— 循环放进来必然被砍。执行体是登录 shell 里的 orca-goal 进程,
// 这里只做三件事:起停它、把状态镜像进 storage 给面板读、发通知。
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const GOAL_HOME = process.env.ORCA_GOAL_HOME || path.join(os.homedir(), '.orca-goal')
const MIRROR_KEY = 'goals' // 面板读这个 key
const ACTIVE_POLL_MS = 5_000 // 有目标在跑时的刷新节奏
const CLI_TIMEOUT_MS = 20_000 // 必须明显小于命令处理器的 30 秒上限
const ROUND_TAIL = 20 // 时间线只要最近这些轮
// storage 单值上限 256 KiB(PLUGIN_STORAGE_VALUE_MAX_BYTES),留出余量。
// 超了宿主会抛(plugin-host-method-bindings 里 storage.set 直接 throw),整份写不进去,
// 面板就一直停在旧数据上 —— 所以宁可自己先裁到装得下。
const PAYLOAD_BUDGET = 200 * 1024
// 内容没变也至少这么久写一次。没有心跳的话 updatedAt 只代表「上次有新进展」,
// 面板就分不清「这一轮还没跑完」和「worker 已经被回收」—— 而这两种情况该说的话完全不同。
const HEARTBEAT_MS = 60_000
// 只读日志尾部这么多字节。跑久了的目标日志能到几 MB,而时间线只要最后 20 行 ——
// 每 5 秒把整份读进来再扔掉 99% 是纯浪费。
const LOG_TAIL_BYTES = 128 * 1024

let api = null
let pollTimer = null
let lastMirrored = ''
let lastWriteAt = 0

export default async function activate(orca) {
  api = orca
  orca.log(`目标模式已激活,授予的能力:${orca.grantedCapabilities.join(', ')}`)

  orca.commands.register('goal.status', async () => {
    const goals = await readGoals()
    const active = goals.filter((g) => g.state === 'active')
    const text = active.length
      ? `进行中 · 第 ${active[0].turns} 轮 · ${active[0].worktreePath}`
      : goals.length
        ? `没有进行中的目标(共 ${goals.length} 条记录)`
        : '还没有设过目标'
    await notify(text)
    await mirror()
    return { active: active.length, total: goals.length, text }
  })

  // 命令拿不到 worktree 上下文(invokeCommand 只传 pluginKey 和 commandId),
  // 所以有多个目标在跑时不敢猜停哪个 —— 宁可让用户去 CLI 里点名。
  orca.commands.register('goal.stop', async () => {
    const active = (await readGoals()).filter((g) => g.state === 'active')
    if (active.length === 0) {
      await notify('没有进行中的目标')
      return { stopped: 0 }
    }
    if (active.length > 1) {
      await notify(
        `有 ${active.length} 个目标在跑,命令分不清停哪个 —— 请用 orca-goal stop --terminal`
      )
      return { stopped: 0, ambiguous: active.length }
    }
    const result = await runCli(['stop', '--terminal', active[0].terminalHandle])
    await notify(result.ok ? '已停止' : `停止失败:${result.output.slice(-160)}`)
    await mirror()
    return { stopped: result.ok ? 1 : 0 }
  })

  // 命令不能带参数,也没有「弹输入框」的宿主 API,所以只能把人引到面板。
  orca.commands.register('goal.start', async () => {
    await notify('在右侧「目标」面板里填目标和验收标准,然后点开始')
    return { hint: 'panel' }
  })

  // manifest 里声明了这个事件,所以它能把已被回收的 worker 重新唤醒。
  orca.events.on('agent.status.changed', () => {
    void mirror() // 不要 await:事件回调超 5 分钟会被 SIGKILL
  })

  await mirror()
}

export function deactivate() {
  stopPolling()
  api = null
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
  }
  pollTimer = null
}

/**
 * 只在有目标进行中时才轮询。
 * 每次 host.call 都会刷新宿主记的 lastActivityAt,所以「轮询 + 心跳」会让空闲回收不触发 ——
 * 这是有意的:有目标在跑的插件不该被当成闲着,面板得能一直看到进度。
 * 没有活动目标就停表,让宿主正常回收,之后靠 agent.status.changed 唤醒。
 */
function schedulePolling(hasActive) {
  if (hasActive && !pollTimer) {
    pollTimer = setInterval(() => void mirror(), ACTIVE_POLL_MS)
    if (typeof pollTimer.unref === 'function') {
      pollTimer.unref()
    }
  } else if (!hasActive) {
    stopPolling()
  }
}

/** 面板显示哪一个:优先进行中的,否则最近更新的(readGoals 已按 updatedAt 排好)。 */
function primaryIndexOf(goals) {
  const active = goals.findIndex((g) => g.state === 'active')
  return active === -1 ? 0 : active
}

/** 逐轮日志再长也要塞进 storage 的单值上限。宁可少显示几轮,也不要整份写不进去。 */
function fitToBudget(goals) {
  for (let tail = ROUND_TAIL; tail > 0; tail = Math.floor(tail / 2)) {
    const candidate = goals.map((g) => ({ ...g, rounds: (g.rounds || []).slice(-tail) }))
    if (Buffer.byteLength(JSON.stringify(candidate), 'utf8') <= PAYLOAD_BUDGET) {
      return candidate
    }
  }
  return goals.map((g) => ({ ...g, rounds: [] }))
}

/** 把 ~/.orca-goal 下的状态与逐轮日志汇总,写进 plugin storage 供面板读取。 */
async function mirror() {
  if (!api) {
    return
  }
  try {
    const records = await readGoals()
    // 存活探测对每个目标都要做(轮询开不开看它),但逐轮日志只有要显示的那个才读 ——
    // 面板一次只显示一个目标,给几十个目标各读一份日志纯属白读。
    const all = await Promise.all(
      records.map(async (g) => ({ ...g, rounds: [], driverAlive: await driverAlive(g) }))
    )
    schedulePolling(all.some((g) => g.state === 'active' && g.driverAlive))
    const primary = all[primaryIndexOf(all)]
    if (primary) {
      primary.rounds = await readRounds(primary)
    }

    const goals = fitToBudget(all)
    const encoded = JSON.stringify(goals)
    const now = Date.now()
    // 有目标在跑时,心跳到点就得写 —— 让 updatedAt 保持「worker 还活着」的含义。
    // 顺带把宿主的空闲回收挡住:目标进行中的插件本来就不该被当成闲着。
    const due = goals.some((g) => g.state === 'active') && now - lastWriteAt >= HEARTBEAT_MS
    if (encoded === lastMirrored && !due) {
      return // 没变又不到心跳,省一次 host 调用
    }
    await api.host.call('storage.set', { key: MIRROR_KEY, value: { updatedAt: now, goals } })
    // 只有写成功才记账:写挂了(超限、磁盘满)必须让下一轮重试,
    // 否则 dedup 会把这份从没落盘的内容当成已写,面板永远等不到它。
    lastMirrored = encoded
    lastWriteAt = now
  } catch (err) {
    api?.log(`镜像目标状态失败:${err?.message || err}`)
  }
}

async function readGoals() {
  let names
  try {
    names = await fs.readdir(path.join(GOAL_HOME, 'goals'))
  } catch {
    return [] // 还没设过目标
  }
  const goals = []
  for (const name of names.filter((n) => n.endsWith('.json'))) {
    try {
      goals.push(JSON.parse(await fs.readFile(path.join(GOAL_HOME, 'goals', name), 'utf8')))
    } catch {
      // 写到一半的文件跳过,下一次镜像会补上
    }
  }
  return goals.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}

/**
 * 驱动进程还活着吗。
 * 「记录写着 active、驱动其实已经死了」是真实发生过的状态(进程崩溃、机器重启),
 * 面板必须能把它和「正在跑」区分开 —— 前者要给「接回」,后者要给「停止」。
 */
async function driverAlive(goal) {
  try {
    const { pid } = JSON.parse(
      await fs.readFile(path.join(GOAL_HOME, 'lock', `${goal.key}.lock`), 'utf8')
    )
    if (!Number.isInteger(pid)) {
      return false
    }
    process.kill(pid, 0)
    return true
  } catch (err) {
    return err?.code === 'EPERM' // 进程在,但不属于当前用户
  }
}

/** 逐轮日志是 JSONL,只读文件尾部再取最近若干轮供时间线渲染。 */
async function readRounds(goal) {
  let handle
  try {
    handle = await fs.open(path.join(GOAL_HOME, 'log', `${goal.key}.jsonl`), 'r')
    const { size } = await handle.stat()
    const start = Math.max(0, size - LOG_TAIL_BYTES)
    const buf = Buffer.alloc(size - start)
    await handle.read(buf, 0, buf.length, start)
    const rounds = []
    const lines = buf.toString('utf8').split('\n').filter(Boolean)
    // 从中间截断的话第一行是残句,直接跳过(下面的 try 也会兜住)。
    for (const line of lines.slice(-ROUND_TAIL)) {
      try {
        rounds.push(JSON.parse(line))
      } catch {
        // 半行,跳过
      }
    }
    return rounds
  } catch {
    return [] // 还没有日志
  } finally {
    await handle?.close().catch(() => {})
  }
}

/**
 * 走登录 shell 起 orca-goal。
 * worker 的 env 是清洗过的白名单,PATH 来自 GUI 应用 —— fnm/nvm/asdf 的 shim 都不在里面,
 * 直接 spawn 会找不到 node。-lc 让它读一遍 profile,PATH 才是终端里那份。
 * 超时必须明显小于命令处理器的 30 秒上限,否则宿主先超时、这里的错误就没人看得见。
 */
function runCli(args) {
  return new Promise((resolve) => {
    const quoted = args.map((a) => `'${String(a).replace(/'/g, `'\\''`)}'`).join(' ')
    const child = spawn(process.env.SHELL || '/bin/zsh', ['-lc', `orca-goal ${quoted}`], {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let out = ''
    const take = (d) => {
      if (out.length < 64_000) {
        out += d
      }
    }
    child.stdout.on('data', take)
    child.stderr.on('data', take)

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve({ ok: false, output: `orca-goal ${args[0]} 超过 ${CLI_TIMEOUT_MS / 1000} 秒未返回` })
    }, CLI_TIMEOUT_MS)

    const settle = (result) => {
      clearTimeout(timer)
      resolve(result)
    }
    child.on('error', (err) => settle({ ok: false, output: String(err.message) }))
    child.on('close', (code) => settle({ ok: code === 0, code, output: out.slice(-4000) }))
  })
}

async function notify(body) {
  try {
    await api?.host.call('notifications.show', {
      title: '目标模式',
      body: String(body).slice(0, 240)
    })
  } catch (err) {
    api?.log(`通知失败:${err?.message || err}`)
  }
}
