import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  pluginManifestSchema,
  PLUGIN_EVENT_NAMES
} from '../../../src/shared/plugins/plugin-manifest'
import { PLUGIN_CAPABILITY_KINDS } from '../../../src/shared/plugins/plugin-capabilities'
import { PANEL_DESIGN_TOKEN_ALLOWLIST } from '../../../src/shared/plugins/plugin-panel-shell'
import { PLUGIN_HOST_API_V0 } from '../../../src/shared/plugins/plugin-host-api'
import { PLUGIN_WORKER_INVOKE_TIMEOUT_MS } from '../../../src/shared/plugins/plugin-host-protocol'

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

  it('goal.status 返回统计,并发通知', async () => {
    await writeGoal({ key: 'a', state: 'active', turns: 4, worktreePath: '/w', updatedAt: 9 })
    const mod = await loadWorker()
    await mod.default(fakeOrca())
    const result = (await commands.get('goal.status')!(null)) as Record<string, number>
    expect(result.active).toBe(1)
    expect(result.text).toContain('第 4 轮')
    expect(calls.some((c) => c.method === 'notifications.show')).toBe(true)
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
  const appCss = readFileSync(path.join(HERE, '../../../src/renderer/src/assets/main.css'), 'utf8')

  it('滚动条照抄 main.css 的 .scrollbar-sleek,不用系统默认', () => {
    // 面板是独立文档继承不到应用样式,不抄就和其它面板对不上。
    const sleek = appCss.slice(appCss.indexOf('.scrollbar-sleek {'))
    const thumbColor = sleek.match(/scrollbar-thumb \{[\s\S]*?background: ([^;]+);/)![1].trim()
    expect(html).toContain('scrollbar-width: thin')
    expect(html).toContain(thumbColor)
    // 匹配真实声明而不是注释里的字眼:不留占位槽,内容不满时右边不空一条。
    const withoutComments = html.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(withoutComments).not.toMatch(/scrollbar-gutter\s*:/)
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
