// 目标按工作区标识,不按终端。
//
// 事故背景:键原来是终端 handle(`term_<uuid>`),那是一个标签页的会话 id。
// 实测一台机器上同一个目录挂着 6 个终端,于是同一工作区可以并行起两个目标,
// 两个驱动同时改同一批文件 —— 而空转熔断、变更取证、验收缓存都靠 git 树哈希,
// 会把对方的改动算成自己的。锁按标签页发,拦不住这件事。
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const HOME = await fs.mkdtemp(path.join(os.tmpdir(), 'goal-wtkey-'))
process.env.ORCA_GOAL_HOME = HOME
test.after(() => fs.rm(HOME, { recursive: true, force: true }))

const { goalKey, newGoal, writeGoal, readGoal, listGoals, migrateLegacyKeys, goalPath } =
  await import('./goal-state.mjs')

test('同一个工作区算出同一个键,不同工作区不撞', () => {
  const a = goalKey('/Users/x/dev/markdown')
  assert.equal(a, goalKey('/Users/x/dev/markdown/'), '末尾斜杠不该算成另一个工作区')
  assert.equal(a, goalKey('/Users/x/dev/markdown/./'), 'path.resolve 要吃掉冗余段')
  assert.notEqual(a, goalKey('/Users/x/dev/orca'))
  // 目录名给人看,哈希保证唯一:只看目录名的话到处都有 client/ 和 docs/,必撞。
  assert.notEqual(goalKey('/a/client'), goalKey('/b/client'))
  assert.match(goalKey('/a/client'), /^client-[0-9a-f]{10}$/)
})

test('macOS 大小写不敏感,不折叠会把一个目录算成两个', () => {
  const same = goalKey('/Users/x/Dev/Markdown') === goalKey('/Users/x/dev/markdown')
  assert.equal(
    same,
    process.platform === 'darwin' || process.platform === 'win32',
    '这两个平台默认大小写不敏感,同一个目录必须算出同一个键'
  )
})

test('空路径要报错,不能静默产出一个共用键', () => {
  assert.throws(() => goalKey(''), /工作区路径不能为空/)
  assert.throws(() => goalKey(null), /工作区路径不能为空/)
  assert.throws(() => goalKey('   '), /工作区路径不能为空/)
})

test('换终端不换键 —— 关掉标签页后目标仍然找得到', () => {
  // 终端 handle 只是「此刻往哪儿灌字」,不参与定位。
  assert.equal(goalKey('/w/proj'), goalKey('/w/proj'))
  const g1 = newGoal({
    key: goalKey('/w/proj'),
    terminalHandle: 'term_aaa',
    worktreePath: '/w/proj'
  })
  const g2 = newGoal({
    key: goalKey('/w/proj'),
    terminalHandle: 'term_bbb',
    worktreePath: '/w/proj'
  })
  assert.equal(g1.key, g2.key, '同一工作区的两次启动必须落在同一个键上,才能被锁拦住')
})

test('老记录按终端命名 —— 迁移到工作区键,并搬走侧车文件', async () => {
  const legacy = 'term_386f4b1d-6fad-4a95-ba69-a4323f87f1a7'
  const worktree = path.join(HOME, 'wt-migrate')
  await fs.mkdir(path.join(HOME, 'log'), { recursive: true })
  await fs.mkdir(path.join(HOME, 'claims'), { recursive: true })
  await fs.mkdir(path.join(HOME, 'verdict'), { recursive: true })
  await writeGoal(
    newGoal({ key: legacy, terminalHandle: legacy, worktreePath: worktree, objective: 'o' })
  )
  await fs.writeFile(path.join(HOME, 'log', `${legacy}.jsonl`), '{"turn":1}\n')
  await fs.writeFile(path.join(HOME, 'log', `${legacy}.out`), 'driver output\n')
  await fs.writeFile(path.join(HOME, 'claims', `${legacy}.txt`), 'complete: x\n')
  await fs.writeFile(path.join(HOME, 'verdict', `${legacy}-turn6.md`), '# 判词\n')

  const moved = await migrateLegacyKeys()
  const next = goalKey(worktree)
  assert.deepEqual(moved, [{ from: legacy, to: next }])

  assert.ok(await readGoal(next), '新键要读得到')
  assert.equal(await readGoal(legacy), null, '老键不该还留着一份,否则面板显示两条')
  assert.equal((await readGoal(next)).key, next, '记录里的 key 字段也要改')
  for (const p of [
    path.join(HOME, 'log', `${next}.jsonl`),
    path.join(HOME, 'log', `${next}.out`),
    path.join(HOME, 'claims', `${next}.txt`),
    path.join(HOME, 'verdict', `${next}-turn6.md`)
  ]) {
    assert.ok(
      await fs.stat(p).then(
        () => true,
        () => false
      ),
      `侧车文件没搬过来:${p} —— 漏一个就等于把那段历史丢了`
    )
  }
  assert.deepEqual(await migrateLegacyKeys(), [], '迁移要幂等,第二次跑没得搬')
})

test('同工作区多条记录:最近更新的占键,较旧的归档', async () => {
  // 按终端命名的时代允许同一目录并存多条。裁决必须是确定的 ——
  // 第一版按 readdir 顺序搬,实测里更旧的那条抢到了键,而人要接回的是更新的那条。
  const worktree = path.join(HOME, 'wt-collide')
  const key = goalKey(worktree)
  const mk = (k, objective, updatedAt) => ({
    ...newGoal({ key: k, terminalHandle: k, worktreePath: worktree, objective }),
    updatedAt
  })
  await writeGoal(mk('term_older', '旧的', 1_000))
  await writeGoal(mk('term_newer', '新的', 9_000))

  const moved = await migrateLegacyKeys()
  assert.equal((await readGoal(key)).objective, '新的', '最近更新的那条必须占住工作区键')
  const archived = moved.find((m) => m.archived)
  assert.equal(archived.from, 'term_older')
  assert.equal((await readGoal(archived.to)).objective, '旧的', '归档的那条要还读得到,不能删')
  assert.match(archived.to, /\.superseded-1000$/)

  // 反向验证:换成旧的更新时间更大,占键的就该换人 —— 规则真的按时间,不是按名字。
  await fs.rm(goalPath(key), { force: true })
  await fs.rm(goalPath(archived.to), { force: true })
  await writeGoal(mk('term_a', 'A 更旧', 1_000))
  await writeGoal(mk('term_b', 'B 更新', 5_000))
  await migrateLegacyKeys()
  assert.equal((await readGoal(key)).objective, 'B 更新')
})

test('迁移幂等:已在位的记录不再被搬,也不会自我归档', async () => {
  const worktree = path.join(HOME, 'wt-idem')
  await writeGoal(
    newGoal({ key: goalKey(worktree), terminalHandle: 't', worktreePath: worktree, objective: 'o' })
  )
  assert.deepEqual(
    (await migrateLegacyKeys()).filter((m) => m.to.startsWith(goalKey(worktree))),
    [],
    '同一条记录反复跑迁移必须无动作,否则每条命令都会归档一次自己'
  )
})

test('驱动还活着的目标不迁移 —— 抽掉它手上的文件路径等于把它弄瞎', async () => {
  const worktree = path.join(HOME, 'wt-live')
  const legacy = 'term_live-uuid'
  await writeGoal(
    newGoal({ key: legacy, terminalHandle: legacy, worktreePath: worktree, objective: 'o' })
  )
  await fs.mkdir(path.join(HOME, 'lock'), { recursive: true })
  // 用自己的 pid 冒充活驱动:isProcessAlive 只问这个 pid 在不在。
  await fs.writeFile(
    path.join(HOME, 'lock', `${legacy}.lock`),
    JSON.stringify({ pid: process.pid, startedAt: Date.now() })
  )

  const moved = await migrateLegacyKeys()
  assert.equal(
    moved.find((m) => m.from === legacy),
    undefined,
    '有活驱动就不该搬'
  )
  assert.ok(await readGoal(legacy), '老记录要原样留着,驱动还在按这个键写')
  await fs.rm(path.join(HOME, 'lock', `${legacy}.lock`), { force: true })
  await fs.rm(goalPath(legacy), { force: true })
})

test('缺 worktreePath 的远古记录:算不出新键,留着不动', async () => {
  await writeGoal({ key: 'term_ancient', state: 'aborted', turns: 0, objective: 'o' })
  const moved = await migrateLegacyKeys()
  assert.equal(
    moved.find((m) => m.from === 'term_ancient'),
    undefined
  )
  assert.ok(
    (await listGoals()).some((g) => g.key === 'term_ancient'),
    '搬不了也不能删 —— 那是用户的历史'
  )
})
