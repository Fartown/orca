import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { buildCommand } from './desktop-notification.mjs'
import { absolutizePathArgs } from './goal-cli-flags.mjs'
import { loadGoalConfig } from './goal-config-file.mjs'
import { formatChoice } from './terminal-picker.mjs'

let dir
test.before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orca-goal-cfg-'))
})
test.after(() => fs.rm(dir, { recursive: true, force: true }))

const write = async (name, body) => {
  const f = path.join(dir, name)
  await fs.writeFile(f, body, 'utf8')
  return f
}

// —— 配置文件 ——

test('读取完整配置', async () => {
  const f = await write(
    'a.json',
    JSON.stringify({
      objective: '把 X 做完',
      check: ['pnpm test'],
      maxTurns: 5,
      promptFile: true
    })
  )
  const c = await loadGoalConfig(f)
  assert.equal(c.objective, '把 X 做完')
  assert.deepEqual(c.check, ['pnpm test'])
  assert.equal(c.maxTurns, 5)
  assert.equal(c.promptFile, true)
})

test('objective 可以写成数组,每项一行', async () => {
  const f = await write('b.json', JSON.stringify({ objective: ['第一行', '第二行'] }))
  assert.equal((await loadGoalConfig(f)).objective, '第一行\n第二行')
})

test('整行 // 注释被忽略', async () => {
  const f = await write('c.json', '{\n // 这条是 lint\n "check": ["pnpm lint"]\n}')
  assert.deepEqual((await loadGoalConfig(f)).check, ['pnpm lint'])
})

test('worktree 相对路径以配置文件所在目录为基准', async () => {
  const f = await write('d.json', JSON.stringify({ worktree: './sub' }))
  assert.equal((await loadGoalConfig(f)).worktree, path.join(dir, 'sub'))
})

test('未知字段直接报错,不静默忽略', async () => {
  const f = await write('e.json', JSON.stringify({ objectve: 'typo' }))
  await assert.rejects(() => loadGoalConfig(f), /未知字段 "objectve"/)
})

test('类型不对要报清楚是哪个字段', async () => {
  const f = await write('f.json', JSON.stringify({ check: 'pnpm test' }))
  await assert.rejects(() => loadGoalConfig(f), /"check" 应当是字符串数组/)
})

test('预算写 0 表示不限,不该被当成非法', async () => {
  const f = await write('g.json', JSON.stringify({ maxTurns: 0, maxMinutes: 0 }))
  const c = await loadGoalConfig(f)
  assert.equal(c.maxTurns, 0)
  assert.equal(c.maxMinutes, 0)
})

test('负数预算仍然报错', async () => {
  const f = await write('g2.json', JSON.stringify({ maxTurns: -1 }))
  await assert.rejects(() => loadGoalConfig(f), /"maxTurns" 应当是非负数/)
})

test('非法 JSON 与文件不存在都有可读报错', async () => {
  const f = await write('h.json', '{ nope')
  await assert.rejects(() => loadGoalConfig(f), /不是合法 JSON/)
  await assert.rejects(() => loadGoalConfig(path.join(dir, 'missing.json')), /配置文件不存在/)
})

// —— 桌面通知的转义 ——

test('AppleScript 参数里的引号和反斜杠被转义', () => {
  const [cmd, args] = buildCommand('t"x', 'a\\b"c')
  if (process.platform !== 'darwin') {
    return
  }
  assert.equal(cmd, 'osascript')
  assert.ok(args[1].includes('\\"'), '双引号应被转义')
  assert.ok(args[1].includes('\\\\'), '反斜杠应被转义')
})

test('不支持的平台返回空命令而不是抛错', () => {
  assert.ok(Array.isArray(buildCommand('a', 'b')))
})

// —— 终端选择项渲染 ——

const term = (over = {}) => ({
  handle: 'term_1',
  worktreePath: '/repo',
  title: '✳ 修 bug',
  agent: { state: 'done', agentType: 'claude' },
  ...over
})

test('选项里标出 agent 类型和状态', () => {
  const line = formatChoice(term(), 0)
  assert.match(line, /claude\/空闲/)
  assert.match(line, /\/repo/)
})

test('标题前缀的状态字形被剥掉,不重复显示', () => {
  assert.ok(!formatChoice(term(), 0).includes('✳'))
})

test('没有 agent 的终端要明确标出来', () => {
  assert.match(formatChoice(term({ agent: null }), 3), /未检测到 agent/)
  assert.match(formatChoice(term({ agent: null }), 3), /^\s*4\./)
})

// —— 轮次判定(回归:kimi 在 thinking 阶段被误判成「毫无动静」)——

const { classifyRound } = await import('./terminal-activity.mjs')
const SENT = 1_000_000
const act = (over = {}) => ({
  connected: true,
  state: null,
  stateStartedAt: null,
  silentMs: null,
  spinning: false,
  source: 'title',
  ...over
})

test('本轮的 hook 状态直接定论', () => {
  assert.equal(
    classifyRound(act({ source: 'hook', state: 'done', stateStartedAt: SENT + 1 }), SENT, 12000),
    'finished'
  )
  assert.equal(
    classifyRound(act({ source: 'hook', state: 'working', stateStartedAt: SENT + 1 }), SENT, 12000),
    'busy'
  )
  assert.equal(
    classifyRound(act({ source: 'hook', state: 'waiting', stateStartedAt: SENT + 1 }), SENT, 12000),
    'needs-user'
  )
})

test('上一轮遗留的 done 不能当成本轮结束', () => {
  const a = act({ source: 'hook', state: 'done', stateStartedAt: SENT - 5000, silentMs: 200 })
  assert.notEqual(classifyRound(a, SENT, 12000), 'finished')
})

test('hook 状态陈旧但终端在刷屏 → busy(kimi thinking 阶段的真实情形)', () => {
  const a = act({ source: 'hook', state: 'done', stateStartedAt: SENT - 5000, silentMs: 92 })
  assert.equal(classifyRound(a, SENT, 12000), 'busy', 'PTY 有输出就说明它活着,不能判成毫无动静')
})

test('hook 状态陈旧且终端安静 → quiet(由调用方结合是否动过再判)', () => {
  const a = act({ source: 'hook', state: 'done', stateStartedAt: SENT - 5000, silentMs: 30000 })
  assert.equal(classifyRound(a, SENT, 12000), 'quiet')
})

test('完全没有 hook 行时,靠字形和静默', () => {
  assert.equal(classifyRound(act({ spinning: true, silentMs: 30000 }), SENT, 12000), 'busy')
  assert.equal(classifyRound(act({ silentMs: 500 }), SENT, 12000), 'busy')
  assert.equal(classifyRound(act({ silentMs: 30000 }), SENT, 12000), 'quiet')
})

test('断开优先于一切', () => {
  assert.equal(
    classifyRound(act({ connected: false, state: 'working' }), SENT, 12000),
    'disconnected'
  )
})

test('resume 的报告接口齐全 —— attach 回调必须存在,否则接管时会崩', async () => {
  const src = await fs.readFile(new URL('./orca-goal.mjs', import.meta.url), 'utf8')
  for (const hook of [
    'attach:',
    'round:',
    'working:',
    'needsUser:',
    'verifying:',
    'command:',
    'verified:',
    'tamper:',
    'warn:'
  ]) {
    assert.ok(src.includes(hook), `makeReport 缺少 ${hook}`)
  }
})

// —— 预算写 0 表示不限,不能把 0 印出来 ——

test('预算渲染:0 显示为不限', async () => {
  const src = await fs.readFile(new URL('./orca-goal.mjs', import.meta.url), 'utf8')
  const describeBudget = new Function(
    `return ${src.match(/function describeBudget[\s\S]*?\n\}/)[0].replace('function describeBudget', 'function')}`
  )()
  assert.equal(describeBudget({ maxTurns: 0, maxMinutes: 0 }), '轮数不限 / 时长不限')
  assert.equal(describeBudget({ maxTurns: 0, maxMinutes: 600 }), '轮数不限 / 600 分钟')
  assert.equal(describeBudget({ maxTurns: 20, maxMinutes: 180 }), '20 轮 / 180 分钟')
})

test('注入给 agent 的提示词里,不限预算不能写成 0', async () => {
  // 0 是有效取值,?? 挡不住它 —— 曾经因此让提示词出现「Turn 4 of 0」,
  // agent 可能据此以为预算已经耗尽。
  const src = await fs.readFile(new URL('./goal-loop.mjs', import.meta.url), 'utf8')
  const body = src.match(/function promptVars[\s\S]*?\n\}/)[0]
  assert.ok(!/maxTurns: goal\.budget\.maxTurns \?\?/.test(body), 'maxTurns 必须用 || 而不是 ??')
  assert.ok(
    !/maxMinutes: goal\.budget\.maxMinutes \?\?/.test(body),
    'maxMinutes 必须用 || 而不是 ??'
  )
  assert.match(body, /maxTurns: goal\.budget\.maxTurns \|\| '不限'/)
  assert.match(body, /maxMinutes: goal\.budget\.maxMinutes \|\| '不限'/)
})

test('数值参数非法时直接报错,不静默退化', async () => {
  // --check-timeout abc → NaN → setTimeout(NaN) 被 Node 当成 1 毫秒 →
  // 每条验收刚起就被杀 → 完成声明永远被驳回。而 0 在轮数/时长里是「不限」,在超时里相反。
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const run = promisify(execFile)
  const cli = new URL('./orca-goal.mjs', import.meta.url).pathname
  for (const bad of ['abc', '0', '-5']) {
    const r = await run(process.execPath, [
      cli,
      'start',
      '--terminal',
      'x',
      '--objective',
      'y',
      '--check-timeout',
      bad
    ]).catch((e) => e)
    assert.match(
      String(r.stderr || r.stdout),
      /--check-timeout 需要一个大于 0 的秒数/,
      `${bad} 应该被拒`
    )
  }
})

test('认领文件是目录 / 超大 / 大写开头,都不该被当成完成声明', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'goal-claim-'))
  process.env.ORCA_GOAL_HOME = home
  const { readClaim, claimPath, clearClaim } = await import(`./goal-claim.mjs?t=${Math.random()}`)
  await fs.mkdir(path.join(home, 'claims'), { recursive: true })

  await fs.mkdir(claimPath('a'), { recursive: true })
  assert.equal((await readClaim('a')).kind, 'malformed', '目录不该抛,也不该算声明')
  await clearClaim('a') // 不带 recursive 会 EISDIR,每轮必抛

  await fs.writeFile(claimPath('b'), 'x'.repeat(100 * 1024))
  assert.equal((await readClaim('b')).kind, 'malformed', '超大文件不该整份读进来当声明')

  // 日志行:git 输出里很常见,原来会被当成完成声明。
  // 现在落进 malformed —— 不算声明,而且会告警,比静默忽略更好。
  await fs.writeFile(claimPath('c'), 'Complete: 5 files changed, 12 insertions\n')
  assert.equal((await readClaim('c')).kind, 'malformed')

  await fs.writeFile(claimPath('d'), 'complete: 真的做完了\n')
  assert.equal((await readClaim('d')).kind, 'complete')

  // 接管的轮次不注入、也就不清认领,上一轮的声明会被当成刚写的。
  // 实测:一句九小时前的「受阻」被每一轮重新裁决,守卫每 45 秒停一次「等你确认」,
  // agent 正常干活却永远推不动。所以早于本轮起点的声明一律不算数。
  const claimMtime = (await fs.stat(claimPath('d'))).mtimeMs
  assert.equal((await readClaim('d', { after: claimMtime + 1000 })).kind, 'stale')
  assert.equal((await readClaim('d', { after: claimMtime })).kind, 'complete', '同一时刻写的算本轮')
  await fs.rm(home, { recursive: true, force: true })
})

test('锁文件里的 pid 被复用时,不能对无关进程动手', async () => {
  // 锁文件只在干净退出时删除;SIGKILL / 断电 / forget 之后残留,重启后 pid 空间重排。
  // 实测复现过:status 报「驱动在跑」、start 被拒,而 stop 把一个无关进程 SIGTERM + SIGKILL。
  const { isOurDriver, stopProcess } = await import('./detached-driver.mjs')
  const { spawn } = await import('node:child_process')
  const victim = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' })
  victim.unref()
  try {
    assert.equal(isOurDriver(victim.pid, 'term_whatever'), false, 'sleep 不是我们的驱动')
    assert.equal(await stopProcess(victim.pid, { key: 'term_whatever' }), 'not-ours')
    assert.equal(victim.killed, false)
    // 自己这个进程的命令行里有 node,但没有目标 key —— 同样不该被认成驱动
    assert.equal(isOurDriver(process.pid, 'term_whatever'), false)
  } finally {
    try {
      process.kill(victim.pid)
    } catch {
      /* 已经没了 */
    }
  }
})

test('orca CLI 的命令名按平台走,和上游那份定义一致', async () => {
  // Linux 上它叫 orca-ide(避开 GNOME Orca 读屏软件),Windows 上是 .cmd 垫片。
  // 写死 'orca' 的话 Linux 开箱即坏,报错还只说「找不到命令」。
  const src = await fs.readFile(new URL('./orca-terminal.mjs', import.meta.url), 'utf8')
  assert.match(src, /linux[\s\S]{0,80}orca-ide/, 'Linux 分支要在')
  assert.match(src, /win32[\s\S]{0,80}orca\.cmd/, 'Windows 分支要在')
  // 和上游定义对齐:上游改了名字这条断言会挂,提醒同步
  const upstream = await fs.readFile(
    new URL('../../src/shared/orca-cli-command-name.ts', import.meta.url),
    'utf8'
  )
  for (const name of ['orca-ide', 'orca.cmd']) {
    assert.ok(upstream.includes(name), `上游应该仍然用 ${name}`)
  }
})

// —— 转交给后台驱动的参数 ——

// 后台驱动的 cwd 是状态目录,不是你敲命令的地方。转交参数时不把路径定死成绝对路径,
// 父进程会照常打印「已在后台启动」,子进程却当场因「配置文件不存在」退出 ——
// 现场看着像启动成功了,唯一线索埋在驱动日志末尾。实测踩过一次。
test('转交后台的路径参数一律变成绝对路径', () => {
  assert.deepEqual(absolutizePathArgs(['-f', '.docs/goal.json'], '/repo'), [
    '-f',
    '/repo/.docs/goal.json'
  ])
  assert.deepEqual(absolutizePathArgs(['--file', './goal.json'], '/repo'), [
    '--file',
    '/repo/goal.json'
  ])
  // --worktree 也走这条路。它在 resolveSettings 里确实 absolutize 过,但那行在子进程里
  // 也会再跑一次,基准变成状态目录 —— 父进程算出来的绝对值根本没被转交。
  assert.deepEqual(absolutizePathArgs(['--worktree', 'sub/tree'], '/repo'), [
    '--worktree',
    '/repo/sub/tree'
  ])
})

test('已经是绝对路径的原样不动', () => {
  assert.deepEqual(absolutizePathArgs(['-f', '/abs/goal.json'], '/repo'), ['-f', '/abs/goal.json'])
})

test('非路径参数不碰 —— 验收命令在工作区里跑,改了就跑错地方', () => {
  const args = ['--check', './scripts/verify.sh', '--objective', './不是路径,是描述']
  assert.deepEqual(absolutizePathArgs(args, '/repo'), args)
})

test('把 flag 名当取值传进来时不误伤后面那个参数', () => {
  // `--objective --file` 里那个 --file 是描述文本,不是参数。按位置盲扫会把它当参数,
  // 于是去动再后面一个 token,改错人。
  assert.deepEqual(absolutizePathArgs(['--objective', '--file', '--worktree', 'w'], '/repo'), [
    '--objective',
    '--file',
    '--worktree',
    '/repo/w'
  ])
})
