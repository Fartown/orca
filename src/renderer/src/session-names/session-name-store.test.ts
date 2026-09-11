import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSessionNameStore, type SessionNameRequest } from './session-name-store'
import { canonicalSessionTitleKey } from '../lib/canonical-session-titles'
import type {
  AiVaultSessionTitlesArgs,
  AiVaultSessionTitlesResult
} from '../../../shared/ai-vault-session-title'

const request: SessionNameRequest = {
  executionHostId: 'local',
  agent: 'codex',
  sessionId: 'session'
}
const key = canonicalSessionTitleKey('local', 'codex', 'session')
const answer = (title: string) => ({
  titles: [
    {
      agent: 'codex' as const,
      sessionId: 'session',
      title: 'First prompt',
      providerName: { kind: 'named' as const, title, field: 'session_index.thread_name' },
      generatedTitle: '运行测试'
    }
  ]
})
afterEach(() => vi.useRealTimers())

describe('shared name request and subscription store', () => {
  it('invalidates a pending identity read without losing its confirmed name or another host', async () => {
    const completions: ((value: AiVaultSessionTitlesResult) => void)[] = []
    const resolve = vi.fn(
      () => new Promise<AiVaultSessionTitlesResult>((done) => completions.push(done))
    )
    const store = createSessionNameStore(resolve)
    store.publish('local', answer('Last confirmed name'))
    const oldLocal = store.read([request])
    const remote = { ...request, executionHostId: 'ssh:remote' as const }
    const remoteRead = store.read([remote])
    await vi.waitFor(() => expect(completions).toHaveLength(2))
    store.invalidate([request])
    await oldLocal
    expect(store.getSnapshot().get(key)?.title).toBe('Last confirmed name')
    const freshLocal = store.read([request])
    await vi.waitFor(() => expect(completions).toHaveLength(3))
    completions[2](answer('Fresh local name'))
    await freshLocal
    completions[0](answer('Obsolete local name'))
    completions[1](answer('Remote name'))
    await remoteRead
    expect(store.getSnapshot().get(key)?.title).toBe('Fresh local name')
    expect(
      store.getSnapshot().get(canonicalSessionTitleKey('ssh:remote', 'codex', 'session'))?.title
    ).toBe('Remote name')
    await store.read([request])
    expect(resolve).toHaveBeenCalledTimes(3)
  })

  it('invalidates a queued read before dispatch and permits a fresh one', async () => {
    const resolve = vi.fn(async () => answer('Fresh name'))
    const store = createSessionNameStore(resolve)
    const old = store.read([request])
    store.invalidate([request])
    const fresh = store.read([request])
    await Promise.all([old, fresh])
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot().get(key)?.title).toBe('Fresh name')
  })

  it('does not publish a response from before reset into the next lifecycle', async () => {
    let finish!: (value: AiVaultSessionTitlesResult) => void
    const store = createSessionNameStore(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const reading = store.read([request])
    await Promise.resolve()
    store.reset()
    await reading
    finish(answer('Previous lifecycle'))
    await Promise.resolve()
    expect(store.getSnapshot().size).toBe(0)
  })

  it('revalidates a missing native name at 20 seconds even with a nonempty fallback', async () => {
    vi.useFakeTimers()
    const resolve = vi.fn(async () => ({
      titles: [],
      nameEvidence: [
        {
          agent: 'codex' as const,
          sessionId: 'session',
          providerName: { kind: 'absent' as const },
          generatedTitle: '运行测试'
        }
      ]
    }))
    const store = createSessionNameStore(resolve)
    const stop = store.watch([request])
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(19_999)
    expect(resolve).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(resolve).toHaveBeenCalledTimes(2)
    stop.unsubscribe()
  })

  it('does not lose a new transcript hint supplied during an in-flight read', async () => {
    let finish!: (value: AiVaultSessionTitlesResult) => void
    const resolve = vi
      .fn<(args: AiVaultSessionTitlesArgs) => Promise<AiVaultSessionTitlesResult>>()
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            finish = done
          })
      )
      .mockResolvedValue(answer('Resolved with new hint'))
    const store = createSessionNameStore(resolve)
    const first = store.read([request])
    await Promise.resolve()
    const second = store.read([{ ...request, transcriptPath: '/new/hint.jsonl' }])
    finish({ titles: [] })
    await Promise.all([first, second])
    expect(resolve).toHaveBeenCalledTimes(2)
    expect(resolve.mock.calls[1]![0].requests[0]!.transcriptPath).toBe('/new/hint.jsonl')
    expect(store.getSnapshot().get(key)?.title).toBe('Resolved with new hint')
  })

  it('deduplicates overlapping consumers and scopes the same id by host', async () => {
    const resolve = vi.fn(async (args: AiVaultSessionTitlesArgs) =>
      answer(args.executionHostScope!)
    )
    const store = createSessionNameStore(resolve)
    await Promise.all([
      store.read([request]),
      store.read([request]),
      store.read([{ ...request, executionHostId: 'ssh:remote' }])
    ])
    expect(resolve).toHaveBeenCalledTimes(2)
    expect(store.getSnapshot().get(key)?.title).toBe('local')
    expect(
      store.getSnapshot().get(canonicalSessionTitleKey('ssh:remote', 'codex', 'session'))?.title
    ).toBe('ssh:remote')
    await store.read([request])
    expect(resolve).toHaveBeenCalledTimes(2)
  })

  it('retains a known name on unavailable/absent and reveals task fallback only on clear', async () => {
    const resolve = vi.fn(async () => answer('Native name'))
    const store = createSessionNameStore(resolve)
    await store.read([request])
    const snapshot = store.getSnapshot()
    for (const kind of ['unavailable', 'absent'] as const) {
      store.publish('local', {
        titles: [],
        nameEvidence: [{ agent: 'codex', sessionId: 'session', providerName: { kind } }]
      })
      expect(store.getSnapshot()).toBe(snapshot)
    }
    store.publish('local', {
      titles: [],
      nameEvidence: [{ agent: 'codex', sessionId: 'session', providerName: { kind: 'cleared' } }]
    })
    expect(store.getSnapshot().get(key)?.title).toBe('运行测试')
  })

  it('notifies all consumers of a new native name', async () => {
    let title = 'First name'
    const store = createSessionNameStore(async () => answer(title))
    const first = vi.fn(),
      second = vi.fn()
    store.subscribe(first)
    store.subscribe(second)
    await store.read([request])
    title = 'Renamed by provider'
    await store.read([request], true)
    expect(first).toHaveBeenCalledTimes(2)
    expect(second).toHaveBeenCalledTimes(2)
    expect(store.getSnapshot().get(key)?.title).toBe(title)
  })

  it('has one timer for all watched surfaces and releases it when the last unmounts', async () => {
    vi.useFakeTimers()
    const resolve = vi.fn(async () => answer('Native name'))
    const store = createSessionNameStore(resolve)
    const stopA = store.watch([request]),
      stopB = store.watch([request])
    await vi.advanceTimersByTimeAsync(0)
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(1)
    stopA.unsubscribe()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(resolve).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(280_000)
    expect(resolve).toHaveBeenCalledTimes(2)
    stopB.unsubscribe()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('preserves the existing host batching bound and survives a failed host', async () => {
    const resolve = vi.fn(async (args: AiVaultSessionTitlesArgs) => {
      if (args.executionHostScope === 'ssh:down') {
        throw new Error('offline')
      }
      return { titles: args.requests.map((item) => ({ ...item, title: 'Task fallback' })) }
    })
    const store = createSessionNameStore(resolve)
    await store.read([
      ...Array.from({ length: 65 }, (_, index) => ({ ...request, sessionId: `s-${index}` })),
      { ...request, executionHostId: 'ssh:down' }
    ])
    expect(resolve.mock.calls.map(([args]) => args.requests.length).sort((a, b) => b - a)).toEqual([
      64, 1, 1
    ])
    expect(store.getSnapshot().size).toBe(66)
    expect(
      store.getSnapshot().get(canonicalSessionTitleKey('ssh:down', 'codex', 'session'))
        ?.providerName?.kind
    ).toBe('unavailable')
  })
})
