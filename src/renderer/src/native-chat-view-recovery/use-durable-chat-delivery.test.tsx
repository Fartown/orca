// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDurableChatDelivery } from './use-durable-chat-delivery'
import type { NativeChatMessage } from '../../../shared/native-chat/native-chat-types'
import type {
  DurableChatSubmitApi,
  DurableChatSubmitRecord
} from '../../../shared/native-chat-view-recovery/durable-chat-submit'

const contact = vi.hoisted(() => {
  // Keyed reads only, like the store's AcceptedAgentStatuses; rows are replaced, never edited.
  const statuses = new Map<
    string,
    { state: string; turnStartedAt?: number; stateObservedAt?: number; updatedAt?: number }
  >()
  return { live: false, listeners: new Set<() => void>(), statuses }
})
vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({
      runtimeStatusByEnvironmentId: new Map(),
      agentStatusByPaneKey: contact.statuses,
      sshConnectionStates: new Map(),
      runtimeEnvironments: [],
      settings: {},
      sshStateByEnvironment: {}
    }),
    subscribe: (callback: () => void) => {
      contact.listeners.add(callback)
      return () => contact.listeners.delete(callback)
    }
  }
}))
vi.mock('../hooks/ipc-events/runtime-events/runtime-environment-subscription-selection', () => ({
  getReachableRuntimeEnvironmentIds: () => (contact.live ? ['mini'] : [])
}))

function record(): DurableChatSubmitRecord {
  return {
    id: '0a10598a-78f4-410a-b210-10fb7748bbe9',
    paneKey: 'pane-a',
    ptyId: 'remote:mini@@term',
    sessionId: 'session',
    text: 'kept original',
    imagePaths: ['/host/image.png'],
    clearInput: '\x15',
    sentAt: 1000,
    afterMessageId: 'boundary',
    afterMessageTimestamp: 900,
    terminal: 'term',
    hostPtyId: 'host-pty',
    processIncarnation: 'inc',
    environmentId: 'mini',
    runtimeId: 'runtime',
    executionHostId: 'runtime:mini',
    state: 'input_accepted',
    updatedAt: 1000
  }
}
let api: DurableChatSubmitApi
let rows: DurableChatSubmitRecord[]
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1000)
  contact.live = false
  contact.listeners.clear()
  contact.statuses.clear()
  rows = [record()]
  api = {
    list: vi.fn(async (paneKey) => rows.filter((r) => r.paneKey === paneKey)),
    prepare: vi.fn(async () => record()),
    dispatch: vi.fn(async () => {}),
    query: vi.fn(async () => {}),
    confirm: vi.fn(async () => {}),
    onChanged: () => () => {}
  }
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { nativeChat: { durableSubmit: api } }
  })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function useDelivery(paneKey: string) {
  return useDurableChatDelivery({
    paneKey,
    agent: 'codex',
    session: { sessionId: 'session', messages: [] }
  })
}
async function flush() {
  await act(async () => {})
}

describe('durable Chat recovery in the renderer', () => {
  it('reconciles a transcript-first restored send on its host turn edge, ignoring tool repaint and offline edges', async () => {
    contact.live = true
    rows[0].transcriptBoundary = {
      sessionId: 'session',
      afterMessageId: null,
      afterByteOffset: 20,
      transcriptPath: '/host/session.jsonl',
      fileIdentity: 'dev:ino',
      boundaryFingerprint: '',
      empty: false,
      submittedAt: 1000,
      sessionUnverifiedAtSubmit: true,
      submitPtyId: 'host-pty'
    }
    const messages: NativeChatMessage[] = [
      {
        id: 'actual',
        role: 'user',
        source: 'transcript',
        timestamp: 1100,
        transcriptOrder: 30,
        blocks: [{ type: 'text', text: 'kept original' }]
      }
    ]
    renderHook(() =>
      useDurableChatDelivery({
        paneKey: 'pane-a',
        agent: 'codex',
        session: { sessionId: 'session', messages }
      })
    )
    await flush()
    const notify = async () =>
      act(async () => {
        for (const fn of contact.listeners) {
          fn()
        }
      })
    await notify()
    vi.mocked(api.confirm).mockClear()
    const done = { state: 'done', turnStartedAt: 1100, stateObservedAt: 1200 }
    contact.statuses.set('pane-a', done)
    await notify()
    expect(api.confirm).toHaveBeenCalledOnce()
    contact.statuses.set('pane-a', { ...done, updatedAt: 1300 })
    await notify()
    expect(api.confirm).toHaveBeenCalledOnce()
    contact.live = false
    contact.statuses.set('pane-a', { ...done, updatedAt: 1300, turnStartedAt: 1400 })
    await notify()
    expect(api.confirm).toHaveBeenCalledOnce()
    expect(api.dispatch).not.toHaveBeenCalled()
  })
  it('restores the original text/images after remount, times out even after accepted and never polls/replays offline', async () => {
    let mounted = renderHook(() => useDelivery('pane-a'))
    await flush()
    expect(mounted.result.current.pending).toMatchObject([
      { text: 'kept original', imagePaths: ['/host/image.png'] }
    ])
    expect([...mounted.result.current.notices.values()][0]).toEqual({ sending: true })
    await act(() => vi.advanceTimersByTimeAsync(20_000))
    expect([...mounted.result.current.notices.values()][0]?.text).toMatch(/Delivery unconfirmed/)
    mounted.unmount()
    mounted = renderHook(() => useDelivery('pane-a'))
    await flush()
    expect([...mounted.result.current.notices.values()][0]?.text).toMatch(/Delivery unconfirmed/)
    await act(() => vi.advanceTimersByTimeAsync(200_000))
    expect(api.query).not.toHaveBeenCalled()
    expect(api.dispatch).not.toHaveBeenCalled()
    await act(async () => {
      contact.live = true
      for (const listener of contact.listeners) {
        listener()
      }
    })
    expect(api.query).toHaveBeenCalledExactlyOnceWith(record().id)
    await act(async () => {
      for (const listener of contact.listeners) {
        listener()
      }
      await vi.advanceTimersByTimeAsync(200_000)
    })
    expect(api.query).toHaveBeenCalledOnce()
    expect(api.dispatch).not.toHaveBeenCalled()
  })

  it('does not let an older list response erase a newly prepared durable input', async () => {
    let release: (value: DurableChatSubmitRecord[]) => void = () => {}
    vi.mocked(api.list).mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve
      })
    )
    const mounted = renderHook(() => useDelivery('pane-a'))
    await act(async () =>
      mounted.result.current.send?.({
        ptyId: 'remote:mini@@term',
        text: 'kept original',
        imagePaths: ['/host/image.png'],
        clearInput: '\x15'
      })
    )
    expect(mounted.result.current.pending).toHaveLength(1)
    await act(async () => release([]))
    expect(mounted.result.current.pending).toMatchObject([{ text: 'kept original' }])
    expect(api.dispatch).toHaveBeenCalledExactlyOnceWith(record().id)
    expect(api.prepare).toHaveBeenCalledWith(
      expect.objectContaining({ reconcileRestoredSession: true })
    )
  })

  it('fences a retired pane generation even after A to B to A', async () => {
    let release: (value: DurableChatSubmitRecord[]) => void = () => {}
    vi.mocked(api.list).mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve
      })
    )
    const mounted = renderHook(({ pane }) => useDelivery(pane), {
      initialProps: { pane: 'pane-a' }
    })
    mounted.rerender({ pane: 'pane-b' })
    await flush()
    mounted.rerender({ pane: 'pane-a' })
    await flush()
    expect(mounted.result.current.pending).toHaveLength(1)
    await act(async () => release([]))
    expect(mounted.result.current.pending).toHaveLength(1)
  })
})
