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

const {
  goalKey,
  newGoal,
  writeGoal,
  readGoal,
  listGoals,
  migrateLegacyKeys,
  goalPath,
  listLogGenerations
} = await import('./goal-state.mjs')

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
  // 夹具必须 touch:false —— writeGoal 默认盖章,会把这里精心设的先后顺序抹平
  await writeGoal(mk('term_older', '旧的', 1_000), { touch: false })
  await writeGoal(mk('term_newer', '新的', 9_000), { touch: false })

  const moved = await migrateLegacyKeys()
  assert.equal((await readGoal(key)).objective, '新的', '最近更新的那条必须占住工作区键')
  const archived = moved.find((m) => m.archived)
  assert.equal(archived.from, 'term_older')
  assert.equal((await readGoal(archived.to)).objective, '旧的', '归档的那条要还读得到,不能删')
  assert.match(archived.to, /\.superseded-1000$/)

  // 反向验证:换成旧的更新时间更大,占键的就该换人 —— 规则真的按时间,不是按名字。
  await fs.rm(goalPath(key), { force: true })
  await fs.rm(goalPath(archived.to), { force: true })
  await writeGoal(mk('term_a', 'A 更旧', 1_000), { touch: false })
  await writeGoal(mk('term_b', 'B 更新', 5_000), { touch: false })
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

test('updatedAt 由 writeGoal 盖章 —— 不经过 decide 的落盘也要更新', async () => {
  // 实测事故:预算耗尽走的是循环里的直接落盘,记录写在 09:56,
  // updatedAt 却停在前一轮注入的 22:11,差了 11 小时。面板算陈旧度只看这个字段,
  // 于是任何已结束的目标都会被显示得比实际更旧。
  const worktree = path.join(HOME, 'wt-touch')
  const key = goalKey(worktree)
  const stale = 1_000
  await writeGoal(
    {
      ...newGoal({ key, terminalHandle: 't', worktreePath: worktree, objective: 'o' }),
      updatedAt: stale
    },
    { touch: false }
  )
  assert.equal((await readGoal(key)).updatedAt, stale, 'touch:false 要原样保留')

  const before = Date.now()
  // 模拟预算耗尽那条路径:直写终态,完全不经过 decide()
  const written = await writeGoal({
    ...(await readGoal(key)),
    state: 'budget_exhausted',
    finishReason: '时长预算耗尽',
    updatedAt: stale
  })
  const after = await readGoal(key)
  assert.ok(after.updatedAt >= before, `updatedAt 该被盖成现在:${after.updatedAt} < ${before}`)
  assert.equal(written.updatedAt, after.updatedAt, 'writeGoal 要把盖过章的对象还给调用方')
})

test('迁移不能盖章 —— 否则裁决「谁更新」的依据被自己毁掉', async () => {
  const worktree = path.join(HOME, 'wt-notouch')
  const key = goalKey(worktree)
  const mk = (k, updatedAt) => ({
    ...newGoal({ key: k, terminalHandle: k, worktreePath: worktree, objective: k }),
    updatedAt
  })
  await writeGoal(mk('term_x-old', 1_000), { touch: false })
  await writeGoal(mk('term_x-new', 9_000), { touch: false })
  await migrateLegacyKeys()
  const owner = await readGoal(key)
  assert.equal(owner.objective, 'term_x-new', '最近更新的占键')
  assert.equal(owner.updatedAt, 9_000, '搬文件不是新进展,时间戳必须原样带过来')
})

test('迁移要连上一代归档日志一起搬 —— 那是唯一记着验收判决的地方', async () => {
  // 实测:第一版只搬固定名字的侧车,`<键>.jsonl.<时间>` 落在了老键上跟谁都对不上号。
  // 而那份文件里正是两次「声称完成 → 验收未通过」的唯一记录。
  const legacy = 'term_gen-uuid'
  const worktree = path.join(HOME, 'wt-generations')
  await fs.mkdir(path.join(HOME, 'log'), { recursive: true })
  await writeGoal(
    newGoal({ key: legacy, terminalHandle: legacy, worktreePath: worktree, objective: 'o' }),
    { touch: false }
  )
  await fs.writeFile(path.join(HOME, 'log', `${legacy}.jsonl`), '{"turn":1}\n')
  await fs.writeFile(
    path.join(HOME, 'log', `${legacy}.jsonl.1700000000000`),
    '{"turn":4,"acceptancePassed":false}\n{"turn":6,"acceptancePassed":false}\n'
  )

  await migrateLegacyKeys()
  const next = goalKey(worktree)
  const gens = await listLogGenerations(next)
  assert.equal(gens.length, 2, `当代 + 一代归档都该在新键下:${JSON.stringify(gens)}`)
  assert.equal(gens[0].current, true, '当代排最前')
  assert.equal(gens[1].archivedAt, 1_700_000_000_000)
  const older = await fs.readFile(gens[1].file, 'utf8')
  assert.match(older, /acceptancePassed/, '归档日志的内容要完好搬过来')
  assert.equal(
    await fs.stat(path.join(HOME, 'log', `${legacy}.jsonl.1700000000000`)).then(
      () => true,
      () => false
    ),
    false,
    '老键下不该留下孤儿'
  )
})

test('没有归档时只报当代,不凭空造出一代', async () => {
  const worktree = path.join(HOME, 'wt-onegen')
  const key = goalKey(worktree)
  await fs.mkdir(path.join(HOME, 'log'), { recursive: true })
  await fs.writeFile(path.join(HOME, 'log', `${key}.jsonl`), '{"turn":1}\n')
  const gens = await listLogGenerations(key)
  assert.deepEqual(
    gens.map((g) => g.current),
    [true]
  )
  // 名字里带非数字后缀的不是归档(比如 .trace),不能混进来
  await fs.writeFile(path.join(HOME, 'log', `${key}.jsonl.trace`), 'x')
  assert.equal((await listLogGenerations(key)).length, 1, '后缀不是时间戳的文件不算一代')
})
