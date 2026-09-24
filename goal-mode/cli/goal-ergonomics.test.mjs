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
      guard: 'codex'
    })
  )
  const c = await loadGoalConfig(f)
  assert.equal(c.objective, '把 X 做完')
  assert.deepEqual(c.check, ['pnpm test'])
  assert.equal(c.maxTurns, 5)
  assert.equal(c.guard, 'codex')
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

// —— 读 agent 状态:只搬运状态存储的事实,没有状态行时才看终端 ——

const { describeActivity } = await import('./terminal-activity.mjs')
const act = (row, over = {}) => ({
  connected: true,
  row: row ? { workingMode: null, stateStartedAt: 1, prompt: '', ...row } : null,
  silentMs: null,
  spinning: false,
  ...over
})

test('状态行直接定论,不在读取端重新裁决', () => {
  assert.equal(describeActivity(act({ state: 'done' }), 12000), 'ended')
  assert.equal(describeActivity(act({ state: 'working' }), 12000), 'busy')
  assert.equal(describeActivity(act({ state: 'waiting' }), 12000), 'needs-user')
  assert.equal(describeActivity(act({ state: 'blocked' }), 12000), 'needs-user')
  // 终端还在刷屏也不推翻状态行:判断这一轮有没有真结束是守卫的事。
  assert.equal(
    describeActivity(act({ state: 'done' }, { silentMs: 50, spinning: true }), 12000),
    'ended'
  )
})

test('monitoring 是本轮已结束,只剩后台 shell 挂着 —— 不能当成在干活', () => {
  // 回归:agent 起了一个不退出的 next dev,宿主把 pane 报成 working+monitoring,
  // 按 busy 处理的话这一轮永远等不到结束(实测空等 48 分钟)。
  assert.equal(
    describeActivity(act({ state: 'working', workingMode: 'monitoring' }), 12000),
    'ended'
  )
})

test('完全没有状态行时,靠字形和静默', () => {
  assert.equal(describeActivity(act(null, { spinning: true, silentMs: 30000 }), 12000), 'busy')
  assert.equal(describeActivity(act(null, { silentMs: 500 }), 12000), 'busy')
  assert.equal(describeActivity(act(null, { silentMs: 30000 }), 12000), 'quiet')
  assert.equal(describeActivity(act(null), 12000), 'unknown')
})

test('断开优先于一切', () => {
  assert.equal(
    describeActivity(act({ state: 'working' }, { connected: false }), 12000),
    'disconnected'
  )
})

test('驱动的报告接口齐全 —— 循环会调用的回调都得存在,否则跑到那一步才崩', async () => {
  for (const file of ['./orca-goal.mjs', './goal-driver-entry.mjs']) {
    const src = await fs.readFile(new URL(file, import.meta.url), 'utf8')
    for (const hook of [
      'round:',
      'guard:',
      'guardDone:',
      'verifying:',
      'command:',
      'verified:',
      'warn:'
    ]) {
      assert.ok(src.includes(hook), `${file} 的 makeReport 缺少 ${hook}`)
    }
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

test('SSH 下只信状态行,不拿终端静默顶替', () => {
  const remote = { silentMs: 3_600_000 }
  assert.equal(describeActivity(act({ state: 'working' }, remote), 12000), 'busy')
  assert.equal(describeActivity(act({ state: 'done' }, remote), 12000), 'ended')
})
