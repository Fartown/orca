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
    expect(facts).toContain('第 7 轮')
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

  async function writeGoal(g: GoalRecord, rounds: Record<string, unknown>[] = []) {
    await mkdir(path.join(home, 'goals'), { recursive: true })
    await mkdir(path.join(home, 'log'), { recursive: true })
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
