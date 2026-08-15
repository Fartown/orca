import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pluginManifestSchema, PLUGIN_EVENT_NAMES } from '../../src/shared/plugins/plugin-manifest'
import { PLUGIN_CAPABILITY_KINDS } from '../../src/shared/plugins/plugin-capabilities'
import { PANEL_DESIGN_TOKEN_ALLOWLIST } from '../../src/shared/plugins/plugin-panel-shell'
import { PLUGIN_HOST_API_V0 } from '../../src/shared/plugins/plugin-host-api'
import { PLUGIN_WORKER_INVOKE_TIMEOUT_MS } from '../../src/shared/plugins/plugin-host-protocol'

const HERE = import.meta.dirname
const read = (name: string): string => readFileSync(path.join(HERE, name), 'utf8')

describe('manifest', () => {
  const manifest = JSON.parse(read('orca-plugin.json'))

  it('通过仓库真实的 manifest schema', () => {
    expect(() => pluginManifestSchema.parse(manifest)).not.toThrow()
  })

  it('声明的 capability 和事件都在宿主的白名单里', () => {
    for (const c of manifest.capabilities) {
      expect(PLUGIN_CAPABILITY_KINDS).toContain(c.kind)
    }
    for (const e of manifest.contributes.events) {
      expect(PLUGIN_EVENT_NAMES).toContain(e.on)
    }
  })

  it('入口文件真的存在', () => {
    expect(() => read(manifest.main)).not.toThrow()
    for (const p of manifest.contributes.panels) {
      expect(() => read(p.entry)).not.toThrow()
    }
  })

  it('只申请用得到的能力 —— secrets 没用就不该要', () => {
    const kinds = manifest.capabilities.map((c: { kind: string }) => c.kind)
    expect(kinds).not.toContain('secrets')
  })
})

describe('panel', () => {
  const html = read('panel.html')

  it('只使用宿主注入白名单里的设计 token', () => {
    const own = new Set(['--ok', '--warn', '--r', '--block']) // 面板自己定义的
    const used = [...html.matchAll(/var\((--[a-z-]+)/g)].map((m) => m[1])
    for (const token of new Set(used)) {
      if (own.has(token)) {
        continue
      }
      expect(PANEL_DESIGN_TOKEN_ALLOWLIST, `${token} 不在宿主注入的白名单里`).toContain(token)
    }
  })

  it('用到的宿主方法都是面板可调的', () => {
    const panelCallable = new Set(PLUGIN_HOST_API_V0.filter((e) => e.panel).map((e) => e.name))
    const used = [...html.matchAll(/call\('([a-z.]+)'/g)].map((m) => m[1])
    expect(used.length).toBeGreaterThan(0)
    for (const method of new Set(used)) {
      expect(panelCallable, `${method} 不是面板可调方法`).toContain(method)
    }
  })

  it('不整页重建 —— 那会把用户正在输入的内容冲掉', () => {
    // 允许给具体元素赋 innerHTML(如报错块),但不允许重建根容器。
    expect(html).not.toMatch(/root\.innerHTML\s*=/)
    expect(html).not.toMatch(/document\.body\.innerHTML\s*=/)
  })

  it('token 都带兜底值,宿主没注入时也不至于全黑', () => {
    const bare = [...html.matchAll(/var\((--[a-z-]+)\)/g)].map((m) => m[1])
    const own = new Set(['--ok', '--warn', '--r', '--block'])
    for (const token of new Set(bare)) {
      expect(own, `var(${token}) 没有兜底值`).toContain(token)
    }
  })
})

describe('panel 行为', () => {
  let results: Map<string, unknown>

  function mountPanel(): void {
    const html = read('panel.html')
    document.documentElement.innerHTML = html
      .replace(/^[\s\S]*?<html[^>]*>/, '')
      .replace(/<\/html>\s*$/, '')
    // happy-dom 不执行 srcdoc 里的 <script>,手工跑一遍面板脚本
    const script = html.match(/<script>([\s\S]*?)<\/script>/)![1]
    new Function(script)()
  }

  beforeEach(() => {
    results = new Map()
    vi.useFakeTimers()
    // 假装宿主。用同步 dispatchEvent 而不是 postMessage:后者在 happy-dom 里是异步投递,
    // 配上假定时器就推不动,测试会在消息还没到时就断言。
    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: {
        postMessage(message: { type: string; requestId: string; action: string }) {
          if (message?.type !== 'orca-panel-action') {
            return
          }
          const reply = results.get(message.action) ?? { ok: false, errorCode: 'unknown_method' }
          window.dispatchEvent(
            new MessageEvent('message', {
              data: { type: 'orca-panel-action-result', requestId: message.requestId, ...reply }
            })
          )
        }
      }
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    document.documentElement.innerHTML = ''
  })

  const goal = {
    key: 'k',
    terminalHandle: 'term_abc',
    state: 'active',
    turns: 7,
    startedAt: Date.now() - 42 * 60_000,
    objective: '把登录页补齐',
    budget: { maxTurns: 0, maxMinutes: 600 },
    acceptance: { commands: ['pnpm test'] },
    falseClaims: 2,
    rounds: [{ turn: 7, at: new Date().toISOString(), claim: null, findings: [] }]
  }

  // 答复是同步到达的,只需要把 promise 的微任务队列排空。
  async function flush(): Promise<void> {
    for (let i = 0; i < 5; i++) {
      await Promise.resolve()
    }
  }

  it('读到目标时填状态区,并隐藏空态', async () => {
    results.set('storage.get', { ok: true, value: { value: { goals: [goal] } } })
    mountPanel()
    await flush()
    expect(document.getElementById('status-text')!.textContent).toBe('进行中')
    expect(document.getElementById('status-objective')!.textContent).toContain('登录页')
    expect(document.getElementById('empty')!.hidden).toBe(true)
    expect(document.getElementById('blocker-sec')!.hidden).toBe(true)
  })

  it('预算写 0 表示不限,不该印成 /0', async () => {
    results.set('storage.get', { ok: true, value: { value: { goals: [goal] } } })
    mountPanel()
    await flush()
    const facts = document.getElementById('status-facts')!.textContent!
    expect(facts).toContain('正在跑第 8 轮') // 第 7 轮已入日志,所以在跑的是第 8 轮
    expect(facts).not.toContain('/ 0')
    expect(facts).toContain('/ 600')
    expect(facts).toContain('假完成 2 次')
  })

  it('刷新不冲掉用户正在输入的内容', async () => {
    results.set('storage.get', { ok: true, value: { value: { goals: [goal] } } })
    mountPanel()
    await flush()
    const objective = document.getElementById('objective') as HTMLTextAreaElement
    const criteria = document.getElementById('criteria') as HTMLTextAreaElement
    objective.value = '我正在写的目标'
    criteria.value = '我正在写的验收标准'

    await vi.advanceTimersByTimeAsync(9_000) // 跨过两次刷新

    expect((document.getElementById('objective') as HTMLTextAreaElement).value).toBe(
      '我正在写的目标'
    )
    expect((document.getElementById('criteria') as HTMLTextAreaElement).value).toBe(
      '我正在写的验收标准'
    )
  })

  it('宿主拒绝时显示阻塞提示并带上错误码', async () => {
    results.set('storage.get', { ok: false, errorCode: 'panel_forbidden' })
    mountPanel()
    await flush()
    expect(document.getElementById('blocker-sec')!.hidden).toBe(false)
    expect(document.getElementById('blocker')!.textContent).toContain('panel_forbidden')
  })

  it('没有目标时显示空态', async () => {
    results.set('storage.get', { ok: true, value: { value: { goals: [] } } })
    mountPanel()
    await flush()
    expect(document.getElementById('empty')!.hidden).toBe(false)
    expect(document.getElementById('status-sec')!.hidden).toBe(true)
  })

  it('宿主不回消息时给出提示,而不是一直显示旧数据', async () => {
    // 宿主的 respond() 在面板会话被替换时会直接不回。装一个只吞不回的 parent。
    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: { postMessage() {} }
    })
    mountPanel()
    await flush()
    expect(document.getElementById('blocker-sec')!.hidden).toBe(true) // 还在等,先不吓人
    await vi.advanceTimersByTimeAsync(12_500)
    await flush()
    expect(document.getElementById('blocker-sec')!.hidden).toBe(false)
    expect(document.getElementById('blocker')!.textContent).toContain('收不到宿主回复')
  })

  it('镜像很久没更新时说明数据是旧的 —— worker 会被宿主回收', async () => {
    results.set('storage.get', {
      ok: true,
      value: { value: { updatedAt: Date.now() - 8 * 60_000, goals: [goal] } }
    })
    mountPanel()
    await flush()
    const stale = document.getElementById('stale')!
    expect(stale.hidden).toBe(false)
    expect(stale.textContent).toContain('8 分钟前的快照')
  })

  it('陈旧阈值要留够几个心跳,不然正常运行也会误报', () => {
    const heartbeat = Number(
      read('worker.mjs')
        .match(/HEARTBEAT_MS = (\d+)/)![1]
        .replace(/_/g, '')
    )
    const threshold = Number(read('panel.html').match(/STALE_MS = (\d+)/)![1])
    expect(threshold).toBeGreaterThanOrEqual(heartbeat * 3)
  })

  it('快照过期时必须提示,哪怕它显示的是「中断了」—— 监控界面说谎比不显示更糟', async () => {
    results.set('storage.get', {
      ok: true,
      value: {
        value: {
          updatedAt: Date.now() - 20 * 60_000,
          goals: [{ ...goal, driverAlive: false }]
        }
      }
    })
    mountPanel()
    await flush()
    // 真实事故:worker 三小时前被回收,镜像冻在 aborted,面板把它当成当前状态显示。
    expect(document.getElementById('stale')!.hidden).toBe(false)
    expect(document.getElementById('stale')!.textContent).toContain('不代表当前状态')
    // 标题也要自曝是旧快照,光在下面加一行容易被忽略
    expect(document.getElementById('status-text')!.textContent).toContain('旧快照')
  })

  it('驱动异常退出时把死因显示出来,而不是只说「退出了」', async () => {
    results.set('storage.get', {
      ok: true,
      value: {
        value: {
          updatedAt: Date.now(),
          goals: [
            {
              ...goal,
              driverAlive: false,
              driverError: { kind: 'uncaughtException', message: 'orca terminal show 执行失败' }
            }
          ]
        }
      }
    })
    mountPanel()
    await flush()
    expect(document.getElementById('status-text')!.textContent).toContain('中断了')
    expect(document.getElementById('status-reason')!.textContent).toContain('orca terminal show')
  })

  it('镜像是新的就不提示陈旧', async () => {
    results.set('storage.get', {
      ok: true,
      value: { value: { updatedAt: Date.now(), goals: [goal] } }
    })
    mountPanel()
    await flush()
    expect(document.getElementById('stale')!.hidden).toBe(true)
  })

  it('点操作按钮时命令直接显示在面板里 —— 通知可能被系统静音', async () => {
    results.set('storage.get', {
      ok: true,
      value: { value: { updatedAt: Date.now(), goals: [goal] } }
    })
    results.set('notifications.show', { ok: true, value: { delivered: true } })
    mountPanel()
    await flush()
    const btn = document.querySelector('#actions button[data-action]') as HTMLButtonElement
    btn.click()
    await flush()
    const hint = document.getElementById('hint')!
    expect(hint.hidden).toBe(false)
    expect(hint.textContent).toContain('orca-goal')
    expect(hint.textContent).toContain(goal.terminalHandle)
  })

  it('刷新不冲掉刚点出来的命令提示 —— 和不冲掉输入框是同一个道理', async () => {
    results.set('storage.get', {
      ok: true,
      value: { value: { updatedAt: Date.now(), goals: [goal] } }
    })
    results.set('notifications.show', { ok: true, value: { delivered: true } })
    mountPanel()
    await flush()
    ;(document.querySelector('#actions button[data-action]') as HTMLButtonElement).click()
    await flush()
    expect(document.getElementById('hint')!.hidden).toBe(false)
    await vi.advanceTimersByTimeAsync(9_000) // 跨过两次刷新
    await flush()
    expect(document.getElementById('hint')!.hidden).toBe(false)
  })

  it('目标状态变了才清掉命令提示', async () => {
    results.set('storage.get', {
      ok: true,
      value: { value: { updatedAt: Date.now(), goals: [goal] } }
    })
    results.set('notifications.show', { ok: true, value: { delivered: true } })
    mountPanel()
    await flush()
    ;(document.querySelector('#actions button[data-action]') as HTMLButtonElement).click()
    await flush()
    expect(document.getElementById('hint')!.hidden).toBe(false)
    results.set('storage.get', {
      ok: true,
      value: { value: { updatedAt: Date.now(), goals: [{ ...goal, state: 'complete' }] } }
    })
    await vi.advanceTimersByTimeAsync(4_500)
    await flush()
    expect(document.getElementById('hint')!.hidden).toBe(true)
  })

  it('通知没发出去时说明白,别让用户以为提醒过了', async () => {
    results.set('storage.get', {
      ok: true,
      value: { value: { updatedAt: Date.now(), goals: [goal] } }
    })
    results.set('notifications.show', { ok: true, value: { delivered: false } })
    mountPanel()
    await flush()
    ;(document.querySelector('#actions button[data-action]') as HTMLButtonElement).click()
    await flush()
    expect(document.getElementById('hint-label')!.textContent).toContain('通知也没发出来')
    expect(document.getElementById('hint-cmd')!.textContent).toContain('orca-goal')
  })

  it('填了目标才让点「生成启动命令」', async () => {
    results.set('storage.get', { ok: true, value: { value: { updatedAt: Date.now(), goals: [] } } })
    mountPanel()
    await flush()
    const start = document.getElementById('start') as HTMLButtonElement
    expect(start.disabled).toBe(true)
    const objective = document.getElementById('objective') as HTMLTextAreaElement
    objective.value = '把登录页补齐'
    objective.dispatchEvent(new Event('input'))
    expect(start.disabled).toBe(false)
  })

  it('把表单拼成能直接跑的命令,目标里的引号不会拆坏它', async () => {
    results.set('storage.get', { ok: true, value: { value: { updatedAt: Date.now(), goals: [] } } })
    mountPanel()
    await flush()
    const objective = document.getElementById('objective') as HTMLTextAreaElement
    objective.value = "把 don't-panic 页面补齐"
    objective.dispatchEvent(new Event('input'))
    ;(document.getElementById('start') as HTMLButtonElement).click()
    const cmd = document.getElementById('start-cmd')!.textContent!
    expect(document.getElementById('start-out')!.hidden).toBe(false)
    expect(cmd).toContain('orca-goal start --detach')
    // 单引号必须按 POSIX 的 '\'' 收尾续写,否则参数会在引号处断掉
    expect(cmd).toContain("'把 don'\\''t-panic 页面补齐'")
  })

  it('验收标准走 heredoc 写文件,不内联进 --check', async () => {
    // --check 是 spawn(cmd,{shell:true}) 跑的,内联就是两层引号,用户写个 $ 或引号就崩。
    results.set('storage.get', { ok: true, value: { value: { updatedAt: Date.now(), goals: [] } } })
    mountPanel()
    await flush()
    const objective = document.getElementById('objective') as HTMLTextAreaElement
    objective.value = '还原设计稿'
    objective.dispatchEvent(new Event('input'))
    const criteria = document.getElementById('criteria') as HTMLTextAreaElement
    criteria.value = '每个页面都要有 $HOME 和 "引号" 以及 \'单引号\''
    ;(document.getElementById('start') as HTMLButtonElement).click()
    const cmd = document.getElementById('start-cmd')!.textContent!
    expect(cmd).toContain("<<'ORCA_CRITERIA'")
    // 定界符加了引号,标准原样进文件 —— 里面的 $ 和引号都不该被改写
    expect(cmd).toContain('每个页面都要有 $HOME 和 "引号" 以及 \'单引号\'')
    expect(cmd).toContain('--criteria-file')
    expect(cmd).toContain('--agent codex') // 默认选中的裁判
  })

  it('换了裁判,生成的命令跟着换', async () => {
    results.set('storage.get', { ok: true, value: { value: { updatedAt: Date.now(), goals: [] } } })
    mountPanel()
    await flush()
    const objective = document.getElementById('objective') as HTMLTextAreaElement
    objective.value = 'x'
    objective.dispatchEvent(new Event('input'))
    ;(document.getElementById('criteria') as HTMLTextAreaElement).value = '判据'
    ;(document.querySelector('#judge button[data-agent=claude]') as HTMLButtonElement).click()
    ;(document.getElementById('start') as HTMLButtonElement).click()
    expect(document.getElementById('start-cmd')!.textContent).toContain('--agent claude')
  })

  it('没有能生成验收标准的 CLI 命令,就不摆一个点不动的按钮', () => {
    expect(read('panel.html')).not.toContain('从目标生成')
  })

  it('裁判型验收显示成一句话,不铺一排几乎一样的长命令', async () => {
    const judge = (n: string) =>
      `orca-goal-judge --agent codex --criteria-file /Users/x/.orca-goal/criteria/${n}.md --cwd /Users/x/repo --timeout 1500`
    results.set('storage.get', {
      ok: true,
      value: {
        value: {
          updatedAt: Date.now(),
          goals: [
            {
              ...goal,
              acceptance: { commands: [judge('figma-1-design-system'), judge('figma-2-desktop')] }
            }
          ]
        }
      }
    })
    mountPanel()
    await flush()
    const text = document.getElementById('gate-list')!.textContent!
    expect(text).toContain('codex 判 figma-1-design-system')
    expect(text).toContain('codex 判 figma-2-desktop')
    // 样板不该出现在正文里(完整命令留在 title)
    expect(text).not.toContain('--criteria-file')
    // 串行门禁要说清楚,否则会让人以为每轮拿到全部清单
    expect(text).toContain('第 1 条不通过就停下')
  })

  it('非裁判型的验收命令仍然原样显示', async () => {
    results.set('storage.get', {
      ok: true,
      value: {
        value: {
          updatedAt: Date.now(),
          goals: [{ ...goal, acceptance: { commands: ['pnpm test'] } }]
        }
      }
    })
    mountPanel()
    await flush()
    expect(document.getElementById('gate-list')!.textContent).toContain('pnpm test')
  })

  it('裁判分段控件可切换', async () => {
    results.set('storage.get', { ok: true, value: { value: { goals: [] } } })
    mountPanel()
    await flush()
    const claude = document.querySelector('[data-agent="claude"]') as HTMLButtonElement
    claude.click()
    expect(claude.classList.contains('on')).toBe(true)
    expect(document.querySelector('[data-agent="codex"]')!.classList.contains('on')).toBe(false)
  })
})

describe('worker', () => {
  it('CLI 超时明显小于宿主的命令超时', () => {
    const src = read('worker.mjs')
    const timeout = Number(src.match(/CLI_TIMEOUT_MS = ([\d_]+)/)![1].replace(/_/g, ''))
    expect(timeout).toBeLessThan(PLUGIN_WORKER_INVOKE_TIMEOUT_MS)
  })

  it('事件回调不 await —— 超 5 分钟会被 SIGKILL', () => {
    const src = read('worker.mjs')
    expect(src).toMatch(/events\.on\('agent\.status\.changed'[\s\S]{0,200}void mirror\(\)/)
  })

  it('只调用 worker 侧存在的宿主方法', () => {
    const src = read('worker.mjs')
    const known = new Set(PLUGIN_HOST_API_V0.map((e) => e.name))
    for (const m of new Set([...src.matchAll(/host\.call\('([a-z.]+)'/g)].map((x) => x[1]))) {
      expect(known, `${m} 不是宿主方法`).toContain(m)
    }
  })
})

describe('worker 行为', () => {
  let home: string
  type HostCall = { method: string; params: Record<string, unknown> }
  type GoalRecord = Record<string, unknown> & { key: string }
  let calls: HostCall[]
  let commands: Map<string, (args: unknown) => unknown>
  let events: Map<string, (payload: unknown) => void>

  async function loadWorker() {
    // GOAL_HOME 在模块加载时读一次,所以每个用例都要清缓存重导。
    process.env.ORCA_GOAL_HOME = home
    vi.resetModules()
    return await import('./worker.mjs')
  }

  function fakeOrca() {
    return {
      commands: { register: (id: string, h: (args: unknown) => unknown) => commands.set(id, h) },
      events: { on: (name: string, h: (payload: unknown) => void) => events.set(name, h) },
      host: {
        call: async (method: string, params: Record<string, unknown>) => {
          calls.push({ method, params })
          return { ok: true }
        }
      },
      grantedCapabilities: ['storage', 'notifications:show'],
      log: () => {}
    }
  }

  /** alive=true 时补一个指向本进程的锁文件,让 worker 认为驱动还活着。 */
  async function writeGoal(g: GoalRecord, rounds: Record<string, unknown>[] = [], alive = true) {
    await mkdir(path.join(home, 'goals'), { recursive: true })
    await mkdir(path.join(home, 'log'), { recursive: true })
    await mkdir(path.join(home, 'lock'), { recursive: true })
    if (alive) {
      await writeFile(
        path.join(home, 'lock', `${g.key}.lock`),
        JSON.stringify({ pid: process.pid })
      )
    }
    await writeFile(path.join(home, 'goals', `${g.key}.json`), JSON.stringify(g))
    if (rounds.length) {
      await writeFile(
        path.join(home, 'log', `${g.key}.jsonl`),
        rounds.map((r) => JSON.stringify(r)).join('\n')
      )
    }
  }

  beforeEach(async () => {
    home = await mkdtemp(path.join(tmpdir(), 'goal-worker-'))
    calls = []
    commands = new Map()
    events = new Map()
  })

  afterEach(async () => {
    await rm(home, { recursive: true, force: true })
  })

  it('激活时注册 manifest 里声明的全部命令与事件', async () => {
    const mod = await loadWorker()
    await mod.default(fakeOrca())
    const manifest = JSON.parse(read('orca-plugin.json'))
    for (const c of manifest.contributes.commands) {
      expect([...commands.keys()], `命令 ${c.id} 没注册`).toContain(c.id)
    }
    for (const e of manifest.contributes.events) {
      expect([...events.keys()], `事件 ${e.on} 没订阅`).toContain(e.on)
    }
  })

  it('把目标和逐轮日志镜像进 storage,面板才读得到', async () => {
    await writeGoal({ key: 'k1', state: 'active', turns: 3, updatedAt: 2 }, [{ turn: 3, at: 'x' }])
    const mod = await loadWorker()
    await mod.default(fakeOrca())
    const write = calls.find((c) => c.method === 'storage.set')
    expect(write, '没有写 storage').toBeTruthy()
    expect(write!.params.key).toBe('goals')
    expect((write!.params.value as { goals: GoalRecord[] }).goals[0].key).toBe('k1')
    expect(
      (write!.params.value as { goals: { rounds: unknown[] }[] }).goals[0].rounds
    ).toHaveLength(1)
  })

  it('没有活动目标时不开轮询 —— 否则空闲回收永远不触发', async () => {
    await writeGoal({ key: 'done', state: 'complete', turns: 5, updatedAt: 1 })
    const spy = vi.spyOn(globalThis, 'setInterval')
    const mod = await loadWorker()
    await mod.default(fakeOrca())
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('有活动目标时才开轮询', async () => {
    await writeGoal({ key: 'live', state: 'active', turns: 1, updatedAt: 1 })
    const spy = vi.spyOn(globalThis, 'setInterval')
    const mod = await loadWorker()
    await mod.default(fakeOrca())
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
    mod.deactivate()
  })

  it('内容没变就不重复写 storage', async () => {
    await writeGoal({ key: 'k', state: 'complete', turns: 1, updatedAt: 1 })
    const mod = await loadWorker()
    await mod.default(fakeOrca())
    const before = calls.filter((c) => c.method === 'storage.set').length
    await events.get('agent.status.changed')!(null)
    await new Promise((r) => setTimeout(r, 50))
    expect(calls.filter((c) => c.method === 'storage.set').length).toBe(before)
  })

  it('storage.set 写挂时不记成已写 —— 宿主是抛异常,不是返回 ok:false', async () => {
    await writeGoal({ key: 'a', state: 'active', turns: 1, updatedAt: 2 })
    const mod = await loadWorker()
    const logs: string[] = []
    await mod.default({
      ...fakeOrca(),
      host: {
        call: async (method: string, params: Record<string, unknown>) => {
          calls.push({ method, params })
          // 照抄宿主:plugin-host-method-bindings 里 storage.set 超限直接 throw。
          if (method === 'storage.set') {
            throw new Error('value exceeds 262144 bytes')
          }
          return { ok: true }
        }
      },
      log: (m: string) => logs.push(m)
    })
    const first = calls.filter((c) => c.method === 'storage.set').length
    expect(first).toBe(1)
    expect(logs.some((l) => l.includes('value exceeds'))).toBe(true)
    // 没写进去就不能当成已写:下一次镜像必须重试,否则面板永远等不到这份数据。
    await commands.get('goal.status')!({})
    expect(calls.filter((c) => c.method === 'storage.set').length).toBeGreaterThan(first)
  })

  it('目标多、轮次长时把镜像裁进 storage 的单值上限', async () => {
    // 每个终端一条记录,用户几十个终端很正常;全量带逐轮日志会直接顶穿 256 KiB。
    const files = Array.from(
      { length: 20 },
      (_, i) => `src/renderer/components/module-${i}/index.tsx`
    )
    const rounds = Array.from({ length: 20 }, (_, t) => ({
      turn: t,
      at: new Date().toISOString(),
      changed: { source: files, test: files },
      findings: ['断言被删掉了'.repeat(20)]
    }))
    for (let i = 0; i < 40; i++) {
      await writeGoal(
        { key: `g${i}`, state: i === 0 ? 'active' : 'complete', turns: 20, updatedAt: 100 - i },
        rounds
      )
    }
    const mod = await loadWorker()
    await mod.default(fakeOrca())
    const written = calls.find((c) => c.method === 'storage.set')!
    const bytes = Buffer.byteLength(JSON.stringify(written.params.value), 'utf8')
    expect(bytes).toBeLessThanOrEqual(200 * 1024)
    // 裁剪不能把要显示的那个目标裁没:进行中的仍要带着时间线。
    const value = written.params.value as { goals: { state: string; rounds: unknown[] }[] }
    const active = value.goals.find((g) => g.state === 'active')!
    expect(active.rounds.length).toBeGreaterThan(0)
  })

  it('目标进行中时按心跳重写,updatedAt 才代表 worker 还活着', async () => {
    await writeGoal({ key: 'a', state: 'active', turns: 1, updatedAt: 2 })
    const mod = await loadWorker()
    await mod.default(fakeOrca())
    const writes = () => calls.filter((c) => c.method === 'storage.set')
    expect(writes().length).toBe(1)

    // 内容一个字没变:不到心跳就不该再写。
    await commands.get('goal.status')!({})
    expect(writes().length).toBe(1)

    // 过了心跳窗口,即便内容没变也要写 —— 面板靠这个判断后台还在不在。
    vi.setSystemTime(Date.now() + 61_000)
    await commands.get('goal.status')!({})
    expect(writes().length).toBe(2)
    const [a, b] = writes().map((c) => (c.params.value as { updatedAt: number }).updatedAt)
    expect(b).toBeGreaterThan(a)
    vi.useRealTimers()
  })

  it('没有目标在跑时不心跳 —— 该让宿主回收就回收', async () => {
    await writeGoal({ key: 'a', state: 'complete', turns: 1, updatedAt: 2 })
    const mod = await loadWorker()
    await mod.default(fakeOrca())
    expect(calls.filter((c) => c.method === 'storage.set').length).toBe(1)
    vi.setSystemTime(Date.now() + 10 * 60_000)
    await commands.get('goal.status')!({})
    expect(calls.filter((c) => c.method === 'storage.set').length).toBe(1)
    vi.useRealTimers()
  })

  it('只给要显示的那个目标读日志 —— 面板一次只显示一个', async () => {
    const rounds = [{ turn: 1, at: new Date().toISOString(), state: 'active' }]
    await writeGoal({ key: 'old', state: 'complete', turns: 9, updatedAt: 1 }, rounds)
    await writeGoal({ key: 'now', state: 'active', turns: 2, updatedAt: 9 }, rounds)
    const mod = await loadWorker()
    await mod.default(fakeOrca())
    const value = calls.find((c) => c.method === 'storage.set')!.params.value as {
      goals: { key: string; rounds: unknown[] }[]
    }
    expect(value.goals.find((g) => g.key === 'now')!.rounds.length).toBe(1)
    expect(value.goals.find((g) => g.key === 'old')!.rounds.length).toBe(0)
  })

  it('日志很大时只读尾部,不整份读进来', async () => {
    // 跑久了的目标日志能到几 MB,而时间线只要最后 20 行。
    const fat = Array.from({ length: 4000 }, (_, i) =>
      JSON.stringify({ turn: i, at: new Date().toISOString(), pad: 'x'.repeat(400) })
    ).join('\n')
    await mkdir(path.join(home, 'goals'), { recursive: true })
    await mkdir(path.join(home, 'log'), { recursive: true })
    await writeFile(
      path.join(home, 'goals', 'big.json'),
      JSON.stringify({ key: 'big', state: 'active', turns: 4000, updatedAt: 5 })
    )
    await writeFile(path.join(home, 'log', 'big.jsonl'), fat)
    expect(fat.length).toBeGreaterThan(1_000_000)
    const mod = await loadWorker()
    await mod.default(fakeOrca())
    const value = calls.find((c) => c.method === 'storage.set')!.params.value as {
      goals: { rounds: { turn: number }[] }[]
    }
    const got = value.goals[0].rounds
    expect(got.length).toBeGreaterThan(0)
    // 读的是尾部,所以拿到的必须是最后那些轮,不是开头的。
    expect(got.at(-1)!.turn).toBe(3999)
  })

  it('goal.status 返回统计,并发通知', async () => {
    await writeGoal({ key: 'a', state: 'active', turns: 4, worktreePath: '/w', updatedAt: 9 })
    const mod = await loadWorker()
    await mod.default(fakeOrca())
    const result = (await commands.get('goal.status')!(null)) as Record<string, number>
    expect(result.active).toBe(1)
    expect(result.text).toContain('第 4 轮')
    expect(calls.some((c) => c.method === 'notifications.show')).toBe(true)
  })

  it('通知没送达时留在插件日志里 —— 命令就这一个反馈出口', async () => {
    await writeGoal({ key: 'a', state: 'active', turns: 1, updatedAt: 2 })
    const mod = await loadWorker()
    const logs: string[] = []
    await mod.default({
      ...fakeOrca(),
      host: {
        call: async (method: string, params: Record<string, unknown>) => {
          calls.push({ method, params })
          return method === 'notifications.show' ? { delivered: false } : { ok: true }
        }
      },
      log: (m: string) => logs.push(m)
    })
    await commands.get('goal.status')!({})
    expect(logs.some((l) => l.includes('通知没送达'))).toBe(true)
  })

  it('多个目标在跑时,goal.stop 拒绝猜停哪个', async () => {
    await writeGoal({ key: 'a', state: 'active', turns: 1, terminalHandle: 't1', updatedAt: 2 })
    await writeGoal({ key: 'b', state: 'active', turns: 1, terminalHandle: 't2', updatedAt: 1 })
    const mod = await loadWorker()
    await mod.default(fakeOrca())
    const result = (await commands.get('goal.stop')!(null)) as Record<string, number>
    expect(result.stopped).toBe(0)
    expect(result.ambiguous).toBe(2)
    const note = calls.findLast((c) => c.method === 'notifications.show')
    expect(note!.params.body).toContain('分不清停哪个')
    mod.deactivate()
  })

  it('没有目标时 goal.stop 不报错', async () => {
    const mod = await loadWorker()
    await mod.default(fakeOrca())
    const result = (await commands.get('goal.stop')!(null)) as Record<string, number>
    expect(result.stopped).toBe(0)
  })

  it('半截写入的目标文件不会让镜像整个失败', async () => {
    await mkdir(path.join(home, 'goals'), { recursive: true })
    await writeFile(path.join(home, 'goals', 'broken.json'), '{ "key": "b"')
    await writeGoal({ key: 'ok', state: 'complete', turns: 1, updatedAt: 1 })
    const mod = await loadWorker()
    await mod.default(fakeOrca())
    const write = calls.find((c) => c.method === 'storage.set')
    expect((write!.params.value as { goals: GoalRecord[] }).goals.map((g) => g.key)).toEqual(['ok'])
  })
})

describe('panel 样式与宿主一致', () => {
  const html = read('panel.html')
  const appCss = readFileSync(path.join(HERE, '../../src/renderer/src/assets/main.css'), 'utf8')

  it('滚动条逐字照抄 main.css 的 .scrollbar-sleek', () => {
    const css = appCss.replace(/\/\*[\s\S]*?\*\//g, '')
    const panel = html.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
    for (const decl of [
      'scrollbar-width: thin',
      'width: 12px',
      'border: 3px solid transparent',
      'background-clip: padding-box',
      'min-height: 28px'
    ]) {
      expect(css).toContain(decl)
      expect(panel).toContain(decl)
    }
    // 内容不满时右边不该空一条
    expect(panel).not.toContain('scrollbar-gutter')
  })

  it('滚动的是内层容器,不是整个文档 —— 视口滚动条取 html 的规则,body 上的样式不生效', () => {
    const panel = html
    expect(panel).toMatch(/id="scroll"[^>]*class="scrollbar-sleek"/)
    expect(panel).not.toMatch(/body::-webkit-scrollbar/)
    // body 自己不能再滚,否则会出现内外两根滚动条
    expect(panel).toMatch(/body \{[^}]*overflow: hidden/)
  })
})

describe('状态流转 → 界面', () => {
  const html = read('panel.html')
  const view = new Function(`${html.match(/var VIEW = \{[\s\S]*?\n      \}/)![0]}; return VIEW`)()

  it('进行中只给停止,并收起新建表单', () => {
    expect(view.active.actions).toEqual(['stop'])
    expect(view.active.form).toBe(false)
  })

  it('驱动已退出时给接回而不是停止 —— 没东西可停', () => {
    expect(view.orphaned.actions).toContain('resume')
    expect(view.orphaned.actions).not.toContain('stop')
    expect(view.orphaned.form).toBe(false)
  })

  it('受阻/预算耗尽/空转都能接着跑', () => {
    for (const s of ['blocked', 'budget_exhausted', 'stalled']) {
      expect(view[s].actions, s).toContain('resume')
      expect(view[s].form, s).toBe(true)
    }
  })

  it('已完成不给停止也不给接着跑', () => {
    expect(view.complete.actions).not.toContain('stop')
    expect(view.complete.actions).not.toContain('resume')
  })

  it('只有进行中的两种状态收表单,终止态都放开', () => {
    const noForm = Object.keys(view).filter((k) => !view[k].form)
    expect(noForm.sort()).toEqual(['active', 'orphaned'])
  })

  it('每个动作都配了对应的 CLI 命令提示', () => {
    const cli = new Function(
      `${html.match(/var ACTION_CLI = \{[\s\S]*?\n      \}/)![0]}; return ACTION_CLI`
    )()
    const used = new Set(Object.values(view).flatMap((v: { actions: string[] }) => v.actions))
    for (const a of used) {
      expect(cli, `动作 ${a} 没有 CLI 提示`).toHaveProperty(a as string)
    }
  })
})

describe('最小权限', () => {
  const manifest = JSON.parse(read('orca-plugin.json'))
  const src = read('worker.mjs') + read('panel.html')

  // 宿主方法 → 它需要的 capability
  const NEEDS: Record<string, string> = Object.fromEntries(
    PLUGIN_HOST_API_V0.map((e) => [e.name, e.capability])
  )

  it('声明的能力全都用得到 —— 多要一项,用户就要多授权一项', () => {
    const used = new Set([...src.matchAll(/(?:host\.)?call\(\s*'([a-z.]+)'/g)].map((m) => m[1]))
    const needed = new Set([...used].map((m) => NEEDS[m]).filter(Boolean))
    if (manifest.contributes.events?.length) {
      needed.add('events:subscribe')
    }
    const declared = manifest.capabilities.map((c: { kind: string }) => c.kind)
    const over = declared.filter((d: string) => !needed.has(d))
    expect(over, `多申请了:${over.join(', ')}`).toEqual([])
  })

  it('用到的能力都声明了 —— 少声明会在运行时被 capability_denied', () => {
    const used = new Set([...src.matchAll(/(?:host\.)?call\(\s*'([a-z.]+)'/g)].map((m) => m[1]))
    const declared = new Set(manifest.capabilities.map((c: { kind: string }) => c.kind))
    for (const method of used) {
      expect(declared, `${method} 需要 ${NEEDS[method]} 但没声明`).toContain(NEEDS[method])
    }
  })
})

describe('时间线', () => {
  let results: Map<string, unknown>

  function mountPanel(): void {
    const html = read('panel.html')
    document.documentElement.innerHTML = html
      .replace(/^[\s\S]*?<html[^>]*>/, '')
      .replace(/<\/html>\s*$/, '')
    const script = html.match(/<script>([\s\S]*?)<\/script>/)![1]
    new Function(script)()
  }

  beforeEach(() => {
    results = new Map()
    vi.useFakeTimers()
    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: {
        postMessage(message: { type: string; requestId: string; action: string }) {
          if (message?.type !== 'orca-panel-action') {
            return
          }
          const reply = results.get(message.action) ?? { ok: false, errorCode: 'unknown_method' }
          window.dispatchEvent(
            new MessageEvent('message', {
              data: { type: 'orca-panel-action-result', requestId: message.requestId, ...reply }
            })
          )
        }
      }
    })
  })
  afterEach(() => {
    vi.useRealTimers()
    document.documentElement.innerHTML = ''
  })

  async function show(goal: Record<string, unknown>): Promise<void> {
    results.set('storage.get', { ok: true, value: { value: { goals: [goal] } } })
    mountPanel()
    for (let i = 0; i < 5; i++) {
      await Promise.resolve()
    }
  }

  const base = {
    key: 'k',
    turns: 3,
    startedAt: Date.now() - 60_000,
    objective: 'o',
    budget: {},
    acceptance: { commands: [] },
    driverAlive: true
  }
  const round = (over = {}) => ({
    turn: 2,
    at: new Date().toISOString(),
    prompt: 'continuation',
    claim: null,
    acceptancePassed: null,
    findings: null,
    changed: { source: ['a.ts', 'b.ts'], test: ['a.test.ts'] },
    ...over
  })

  it('每轮列出改了多少文件、哪些文件 —— 这是与 agent 叙述无关的地面真相', async () => {
    await show({ ...base, state: 'complete', driverAlive: false, rounds: [round()] })
    const text = document.getElementById('rounds')!.textContent!
    expect(text).toContain('改了 3 个文件')
    expect(text).toContain('含 1 个测试')
    expect(text).toContain('a.ts')
  })

  it('零改动要明说,不能只显示一句「第 N 轮」', async () => {
    await show({
      ...base,
      state: 'complete',
      driverAlive: false,
      rounds: [round({ changed: { source: [], test: [] } })]
    })
    expect(document.getElementById('rounds')!.textContent).toContain('没有产生文件改动')
  })

  it('注入了哪种提示词要看得见 —— 那是守卫做了什么的直接证据', async () => {
    await show({
      ...base,
      state: 'complete',
      driverAlive: false,
      rounds: [
        round({ turn: 2, prompt: 'rejected-completion' }),
        round({ turn: 3, prompt: 'tamper-challenge' })
      ]
    })
    const text = document.getElementById('rounds')!.textContent!
    expect(text).toContain('验收驳回后重试')
    expect(text).toContain('被质证削弱验收')
  })

  it('声称完成但验收未通过要写清楚已经打回', async () => {
    await show({
      ...base,
      state: 'complete',
      driverAlive: false,
      rounds: [round({ claim: { kind: 'complete' }, acceptancePassed: false })]
    })
    expect(document.getElementById('rounds')!.textContent).toContain('已把失败原文打回')
  })

  it('进行中时要显示当前这一轮 —— 日志里还没有,但那正是最想看的', async () => {
    await show({ ...base, state: 'active', turns: 5, rounds: [round({ turn: 4 })] })
    const items = document.querySelectorAll('.tl-item')
    expect(items.length).toBe(2) // 进行中的 + 已完成的
    expect(items[0].textContent).toContain('进行中')
    expect(items[0].querySelector('.tl-dot')!.className).toContain('run')
  })

  it('驱动已退出就不该再显示「进行中」那一条', async () => {
    await show({
      ...base,
      state: 'active',
      driverAlive: false,
      turns: 5,
      rounds: [round({ turn: 4 })]
    })
    expect(document.querySelectorAll('.tl-item').length).toBe(1)
  })
})

describe('轮次口径一致', () => {
  let results: Map<string, unknown>
  function mount(): void {
    const html = read('panel.html')
    document.documentElement.innerHTML = html
      .replace(/^[\s\S]*?<html[^>]*>/, '')
      .replace(/<\/html>\s*$/, '')
    new Function(html.match(/<script>([\s\S]*?)<\/script>/)![1])()
  }
  beforeEach(() => {
    results = new Map()
    vi.useFakeTimers()
    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: {
        postMessage(m: { type: string; requestId: string; action: string }) {
          if (m?.type !== 'orca-panel-action') {
            return
          }
          const reply = results.get(m.action) ?? { ok: false, errorCode: 'unknown_method' }
          window.dispatchEvent(
            new MessageEvent('message', {
              data: { type: 'orca-panel-action-result', requestId: m.requestId, ...reply }
            })
          )
        }
      }
    })
  })
  afterEach(() => {
    vi.useRealTimers()
    document.documentElement.innerHTML = ''
  })
  async function show(goal: Record<string, unknown>): Promise<void> {
    results.set('storage.get', { ok: true, value: { value: { goals: [goal] } } })
    mount()
    for (let i = 0; i < 5; i++) {
      await Promise.resolve()
    }
  }
  const base = {
    key: 'k',
    startedAt: Date.now(),
    objective: 'o',
    budget: {},
    acceptance: { commands: [] }
  }

  it('顶部的轮次和时间线里那条进行中对得上', async () => {
    await show({
      ...base,
      state: 'active',
      driverAlive: true,
      turns: 6,
      rounds: [{ turn: 6, at: new Date().toISOString(), changed: { source: [], test: [] } }]
    })
    const facts = document.getElementById('status-facts')!.textContent!
    const first = document.querySelector('.tl-item')!.textContent!
    expect(facts).toContain('正在跑第 7 轮')
    expect(first).toContain('第 7 轮')
  })

  it('停下来之后显示总轮数,不再是「正在跑第几轮」', async () => {
    await show({ ...base, state: 'complete', driverAlive: false, turns: 6, rounds: [] })
    const facts = document.getElementById('status-facts')!.textContent!
    expect(facts).toContain('共 6 轮')
    expect(facts).not.toContain('正在跑')
  })

  it('进行中那条要说明它在干嘛,不能只有一个轮次号', async () => {
    await show({ ...base, state: 'active', driverAlive: true, turns: 2, rounds: [] })
    expect(document.querySelector('.tl-item')!.textContent).toContain('等 agent 跑完')
  })

  it('上一轮验收没过时,进行中那条要显示注入的是驳回', async () => {
    await show({
      ...base,
      state: 'active',
      driverAlive: true,
      turns: 3,
      rounds: [
        {
          turn: 3,
          at: new Date().toISOString(),
          claim: { kind: 'complete' },
          acceptancePassed: false,
          changed: { source: [], test: [] }
        }
      ]
    })
    expect(document.querySelector('.tl-item')!.textContent).toContain('验收驳回后重试')
  })
})

describe('轮次推算', () => {
  const html = read('panel.html')
  const currentTurn = new Function(
    `${html.match(/function currentTurn\(g\) \{[\s\S]*?\n      \}/)![0]}; return currentTurn`
  )()

  it('当前这轮还没写进日志时,正在跑的就是 turns 本身', () => {
    // 日志一轮结束才写:turns=5、最后记录第 4 轮 → 第 5 轮正在跑
    expect(currentTurn({ turns: 5, rounds: [{ turn: 4 }] })).toBe(5)
  })

  it('当前这轮已经写进日志时,正在跑的是下一轮', () => {
    expect(currentTurn({ turns: 5, rounds: [{ turn: 5 }] })).toBe(6)
  })

  it('一条日志都没有时,正在跑第一轮', () => {
    expect(currentTurn({ turns: 0, rounds: [] })).toBe(1)
  })
})
