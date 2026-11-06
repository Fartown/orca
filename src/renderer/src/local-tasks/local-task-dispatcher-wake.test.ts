import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { sendMessageToAgent } from '@/lib/agent-message-send'

const fixture = vi.hoisted(() => {
  const pane: { key: string | null } = { key: null }
  const preferences: Record<string, string | null> = {}
  return { inbox: vi.fn(), pane, preferences }
})

vi.mock('@/store', async () => {
  const { createTestStore } = await import('@/store/slices/store-test-helpers')
  return { useAppStore: createTestStore() }
})
vi.mock('@/lib/agent-message-send', () => ({ sendMessageToAgent: vi.fn() }))
vi.mock('./local-task-dispatcher-client', () => ({
  localTaskDispatcherClient: { inbox: fixture.inbox }
}))
vi.mock('./local-task-dispatcher-proposals', () => ({ refreshLocalTaskProposals: vi.fn() }))
vi.mock('./local-tasks-domain-store', () => ({
  localTasksDomainStore: { getState: () => ({ preferences: fixture.preferences }) }
}))
vi.mock('./local-task-dispatcher-session', () => ({
  knownDispatcherPaneKey: () => fixture.pane.key,
  liveDispatcherPaneKey: () => fixture.pane.key
}))

import { useAppStore } from '@/store'
import { createLocalTaskDispatcherWake } from './local-task-dispatcher-wake'

const LEAF = '11111111-1111-4111-8111-111111111111'
const PANE = `tab-d:${LEAF}`

function setStatus(
  state: 'working' | 'done',
  stateStartedAt: number,
  extra: { turnStartedAt?: number; sessionBoundary?: boolean } = {}
): void {
  useAppStore.setState({
    agentStatusByPaneKey: {
      [PANE]: {
        state,
        prompt: '',
        updatedAt: stateStartedAt,
        stateStartedAt,
        paneKey: PANE,
        stateHistory: [],
        ...extra
      }
    }
  })
}

function inboxWith(cursor: string, count = 1) {
  return {
    ok: true,
    inbox: {
      conversationId: 'c',
      items: Array.from({ length: count }, () => ({
        kind: 'progress',
        at: 1,
        taskId: 't',
        taskRef: 'SHOP-1',
        summary: 'SHOP-1: done'
      })),
      cursor,
      more: false,
      watchedTaskCount: 1
    }
  }
}

describe('dispatcher wake', () => {
  let send: Mock<typeof sendMessageToAgent>

  beforeEach(() => {
    fixture.pane.key = PANE
    fixture.inbox.mockReset()
    delete fixture.preferences['dispatcher.wake']
    send = vi.fn<typeof sendMessageToAgent>(async () => ({ status: 'sent' }))
  })

  it('points an idle dispatcher at its inbox once per idle stretch', async () => {
    fixture.inbox.mockResolvedValue(inboxWith('c1'))
    const wake = createLocalTaskDispatcherWake(send, () => false)
    setStatus('done', 100)

    await wake.check()
    await wake.check()

    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0]).toMatchObject({
      target: { kind: 'terminal', tabId: 'tab-d', leafId: LEAF }
    })
  })

  it('stays quiet while the dispatcher works or the inbox is empty', async () => {
    fixture.inbox.mockResolvedValue(inboxWith('c1', 0))
    const wake = createLocalTaskDispatcherWake(send, () => false)
    setStatus('working', 100)
    await wake.check()
    setStatus('done', 200)
    await wake.check()

    expect(fixture.inbox).toHaveBeenCalledTimes(1)
    expect(send).not.toHaveBeenCalled()
  })

  it('does not re-point at an inbox it was already pointed at, only at news', async () => {
    fixture.inbox.mockResolvedValue(inboxWith('c1'))
    const wake = createLocalTaskDispatcherWake(send, () => false)
    setStatus('done', 100)
    await wake.check()
    // The dispatcher ran a turn without acking: the same inbox must not wake it again.
    setStatus('done', 300)
    await wake.check()
    expect(send).toHaveBeenCalledTimes(1)

    fixture.inbox.mockResolvedValue(inboxWith('c2', 2))
    await wake.check()
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('tries again in the same idle stretch when the pointer was not delivered', async () => {
    fixture.inbox.mockResolvedValue(inboxWith('c1'))
    send.mockResolvedValueOnce({ status: 'not-ready', code: 'session-send-refused' })
    const wake = createLocalTaskDispatcherWake(send, () => false)
    setStatus('done', 100)

    await wake.check()
    await wake.check()

    expect(send).toHaveBeenCalledTimes(2)
  })

  it('holds the pointer while the person types in the dispatcher and sends it once they leave', async () => {
    fixture.inbox.mockResolvedValue(inboxWith('c1'))
    let typing = true
    const wake = createLocalTaskDispatcherWake(send, () => typing)
    setStatus('done', 100)

    await wake.check()
    expect(send).not.toHaveBeenCalled()

    typing = false
    await wake.check()
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('stays quiet when the person turned waking off', async () => {
    fixture.inbox.mockResolvedValue(inboxWith('c1'))
    fixture.preferences['dispatcher.wake'] = '0'
    const wake = createLocalTaskDispatcherWake(send, () => false)
    setStatus('done', 100)

    await wake.check()

    expect(fixture.inbox).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('holds the pointer while an unsent draft may sit in its input, until the next turn', async () => {
    fixture.inbox.mockResolvedValue(inboxWith('c1'))
    const wake = createLocalTaskDispatcherWake(send, () => false)
    setStatus('done', 200, { turnStartedAt: 100 })
    wake.noteTyping(150)

    await wake.check()
    expect(send).not.toHaveBeenCalled()

    // The person sent their message: a new turn began after the keys, and ended.
    setStatus('done', 400, { turnStartedAt: 300 })
    await wake.check()
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('does not take a session-start done for a finished turn', async () => {
    fixture.inbox.mockResolvedValue(inboxWith('c1'))
    const wake = createLocalTaskDispatcherWake(send, () => false)
    setStatus('done', 100, { sessionBoundary: true })

    await wake.check()

    expect(fixture.inbox).not.toHaveBeenCalled()
  })
})
