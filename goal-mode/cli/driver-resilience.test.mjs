// 驱动在意外面前该怎么表现:偶发失败要扛住,真崩了要留下死因。
import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

async function withHome(fn) {
  const home = await mkdtemp(path.join(tmpdir(), 'goal-resilience-'))
  const prev = process.env.ORCA_GOAL_HOME
  process.env.ORCA_GOAL_HOME = home
  try {
    return await fn(home)
  } finally {
    process.env.ORCA_GOAL_HOME = prev
    await rm(home, { recursive: true, force: true })
  }
}

test('未捕获异常把死因写进记录,而不是让目标变成悬案', async () => {
  await withHome(async (home) => {
    const { installCrashGuard } = await import(`./driver-crash-guard.mjs?t=${Date.now()}`)
    await mkdir(path.join(home, 'goals'), { recursive: true })
    await writeFile(
      path.join(home, 'goals', 'k.json'),
      JSON.stringify({ key: 'k', state: 'active', turns: 3 })
    )

    const logs = []
    let exitCode = null
    // 直接取它注册的那个处理器来调:走 process.emit 会被 node:test 自己的
    // uncaughtException 处理器接管并重新抛出,测的就不是我们这段了。
    const before = process.listeners('uncaughtException')
    installCrashGuard('k', { log: (m) => logs.push(m), exit: (c) => (exitCode = c) })
    const handler = process.listeners('uncaughtException').find((h) => !before.includes(h))
    assert.ok(handler, '应该注册了 uncaughtException 处理器')
    await handler(new Error('orca terminal show 执行失败'))

    const saved = JSON.parse(await readFile(path.join(home, 'goals', 'k.json'), 'utf8'))
    assert.equal(saved.driverError.kind, 'uncaughtException')
    assert.match(saved.driverError.message, /orca terminal show/)
    // state 不动:agent 多半还在干活,掉线的是看门狗,面板要给「接回」而不是判失败
    assert.equal(saved.state, 'active')
    assert.equal(saved.turns, 3)
    assert.equal(exitCode, 1)
    assert.ok(logs.some((l) => l.includes('驱动进程异常退出')))
    process.removeAllListeners('uncaughtException')
    process.removeAllListeners('unhandledRejection')
  })
})

test('观察终端偶发失败要重试,不能一次抖动就结束目标', async () => {
  // 第 3 次运行就是死在这:轮询里一次 CLI 失败直接抛穿 runLoop,目标就没了。
  const src = await readFile(new URL('./goal-loop.mjs', import.meta.url), 'utf8')
  const poll = src.slice(src.indexOf('async function waitForRoundEnd'))
  assert.match(poll, /try\s*\{\s*\n\s*activity = await observeAgent/, '观察必须包在 try 里')
  assert.match(poll, /OBSERVE_GRACE_MS/, '要有连续失败的宽限期,而不是一次就判死')
  assert.match(poll, /continue/, '失败后要继续轮询')
})

test('宽限期明显长于轮询间隔,否则等于没重试', async () => {
  const src = await readFile(new URL('./goal-loop.mjs', import.meta.url), 'utf8')
  const grace = Number(
    src
      .match(/OBSERVE_GRACE_MS', ([\d\s*_]+)\)/)[1]
      .replace(/[_\s]/g, '')
      .split('*')
      .reduce((a, b) => a * b)
  )
  const poll = Number(src.match(/ORCA_GOAL_POLL_MS', ([\d_]+)\)/)[1].replace(/_/g, ''))
  assert.ok(grace >= poll * 20, `宽限期 ${grace}ms 至少要够重试 20 次(轮询 ${poll}ms)`)
})

test('超长验收输出要保住真正的结尾 —— 失败原因几乎总在最后几行', async () => {
  // 早先「保尾」保的是前 8000 字的尾巴:采集到上限就不再追加,于是真正的失败原因丢光,
  // 而它是 rejected-completion 回灌给 agent 的唯一证据。
  const { runAcceptance, describeFailures } = await import('./acceptance-gate.mjs')
  const noise = "for(let i=0;i<600;i++)console.log('通过用例 '+i+' 的噪音行')"
  const result = await runAcceptance(
    {
      commands: [`node -e "${noise}; console.log('FAILED: src/login.ts:42'); process.exit(1)"`],
      timeoutMs: 30_000,
      cwd: process.cwd()
    },
    {}
  )
  const out = describeFailures(result).output
  assert.match(out, /FAILED: src\/login\.ts:42/, '真正的失败行必须保住')
  assert.match(out, /已截断/, '同时要标明中间被截断了')
})
