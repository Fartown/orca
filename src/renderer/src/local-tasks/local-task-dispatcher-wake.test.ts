import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { acceptedAgentStatuses } from '@/store/slices/agent-status/status-ownership/accepted-agent-statuses'
import type { sendMessageToAgent } from '@/lib/agent-session/messaging/agent-message-send'
import type { LocalTaskEndpointKey } from './local-task-endpoints'

const fixture = vi.hoisted(() => {
  const source: { endpoint: LocalTaskEndpointKey } = { endpoint: 'local' }
  const pane: { key: string | null } = { key: null }
  const preferences: Record<string, string | null> = {}
  return {
    ...source,
    inbox: vi.fn(),
    pane,
    preferences,
    epoch: 0,
    worktreeId: 'global-floating-terminal'
  }
})

vi.mock('@/store', async () => {
  const { createTestStore } = await import('@/store/testing/app-store-test-fixture')
  return { useAppStore: createTestStore() }
})
vi.mock('@/lib/agent-session/messaging/agent-message-send', () => ({ sendMessageToAgent: vi.fn() }))
vi.mock('./local-task-dispatcher-client', () => ({
  localTaskDispatcherClientFor: () => ({ inbox: fixture.inbox }),
  localTaskDispatcherClient: { inbox: fixture.inbox }
}))
vi.mock('./local-task-dispatcher-source', () => ({
  getLocalTaskDispatcherEndpoint: () => fixture.endpoint,
  getLocalTaskDispatcherEpoch: () => fixture.epoch,
  getLocalTaskDispatcherPreferences: () => fixture.preferences,
  isLocalTaskDispatcherSourceCurrent: (endpoint: string, epoch: number) =>
    endpoint === fixture.endpoint && epoch === fixture.epoch,
  subscribeLocalTaskDispatcherSource: () => () => {},
  initialiseLocalTaskDispatcherSource: () => {},
  applyLocalTaskDispatcherPreferences: () => {}
}))
vi.mock('./local-task-dispatcher-proposals', () => ({ refreshLocalTaskProposals: vi.fn() }))
vi.mock('./local-tasks-domain-store', () => ({
  localTasksDomainStore: { getState: () => ({ preferences: fixture.preferences }) }
}))
vi.mock('./local-task-dispatcher-session', () => ({
  getLocalTaskDispatcherSendArgs: (paneKey: string, prompt: string) => ({
    worktreeId: fixture.worktreeId,
    target: { kind: 'terminal', tabId: paneKey.split(':')[0], leafId: paneKey.split(':')[1] },
    prompt
  }),
  knownDispatcherPaneKey: () => fixture.pane.key,
  liveDispatcherPaneKey: () => fixture.pane.key
}))

import { useAppStore } from '@/store'
import {
  createLocalTaskDispatcherWake,
  mayLeaveLocalTaskDispatcherDraft
} from './local-task-dispatcher-wake'

const LEAF = '11111111-1111-4111-8111-111111111111'
const PANE = `tab-d:${LEAF}`

function setStatus(
  state: 'working' | 'done',
  stateStartedAt: number,
  extra: { turnStartedAt?: number; sessionBoundary?: boolean } = {}
): void {
  useAppStore.setState({
    agentStatusByPaneKey: acceptedAgentStatuses([
      [
        PANE,
        {
          state,
          prompt: '',
          updatedAt: stateStartedAt,
          stateStartedAt,
          paneKey: PANE,
          stateHistory: [],
          ...extra
        }
      ]
    ])
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
    fixture.endpoint = 'local'
    fixture.epoch = 0
    fixture.worktreeId = 'global-floating-terminal'
    fixture.pane.key = PANE
    fixture.inbox.mockReset()
    delete fixture.preferences['dispatcher.wake']
    send = vi.fn<typeof sendMessageToAgent>(async () => ({ status: 'sent' }))
    useAppStore.setState({ lastTerminalInputAtByPaneKey: {} })
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

  it('uses the selected source folder and fences its submit after switching sources', async () => {
    fixture.endpoint = 'runtime:mini'
    fixture.worktreeId = 'folder:source'
    fixture.inbox.mockResolvedValue(inboxWith('remote'))
    setStatus('done', 100)
    const wake = createLocalTaskDispatcherWake(send, () => false)
    await wake.check()
    expect(send.mock.calls[0][0].worktreeId).toBe('folder:source')
    fixture.epoch += 1
    expect(send.mock.calls[0][0].beforeTerminalSend?.('submit')).toBe(false)
  })

  it('drops a late inbox after the same source disconnects and reconnects', async () => {
    let release: (value: unknown) => void = () => {}
    fixture.inbox.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve
      })
    )
    setStatus('done', 100)
    const wake = createLocalTaskDispatcherWake(send, () => false)
    const checking = wake.check()
    fixture.epoch += 1
    release(inboxWith('old-generation'))
    await checking
    expect(send).not.toHaveBeenCalled()
  })

  it('does not send a late inbox pointer after its dispatcher binding is disposed', async () => {
    let release: (value: unknown) => void = () => {}
    fixture.inbox.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve
      })
    )
    setStatus('done', 100)
    const wake = createLocalTaskDispatcherWake(send, () => false)
    const checking = wake.check()
    wake.dispose()
    release(inboxWith('closed'))
    await checking
    expect(send).not.toHaveBeenCalled()
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

  it('keeps a pasted or IME committed draft from being submitted after focus leaves', async () => {
    fixture.inbox.mockResolvedValue(inboxWith('c1'))
    const wake = createLocalTaskDispatcherWake(send, () => false)
    setStatus('done', 200, { turnStartedAt: 100 })
    useAppStore.getState().recordTerminalInput(PANE, 150)

    await wake.check()

    expect(send).not.toHaveBeenCalled()
  })

  it('rechecks terminal input immediately before paste and submit', async () => {
    fixture.inbox.mockResolvedValue(inboxWith('c1'))
    const wake = createLocalTaskDispatcherWake(send, () => false)
    setStatus('done', 200, { turnStartedAt: 100 })
    await wake.check()
    const guard = send.mock.calls[0][0].beforeTerminalSend
    expect(guard?.('paste')).toBe(true)
    useAppStore.getState().recordTerminalInput(PANE, 150)
    expect(guard?.('submit')).toBe(false)
  })

  it('does not take a session-start done for a finished turn', async () => {
    fixture.inbox.mockResolvedValue(inboxWith('c1'))
    const wake = createLocalTaskDispatcherWake(send, () => false)
    setStatus('done', 100, { sessionBoundary: true })

    await wake.check()

    expect(fixture.inbox).not.toHaveBeenCalled()
  })

  it('is not held back by keys that leave no text, such as arrows, Esc or a copy', async () => {
    fixture.inbox.mockResolvedValue(inboxWith('c1'))
    const wake = createLocalTaskDispatcherWake(send, () => false)
    setStatus('done', 200, { turnStartedAt: 100 })
    // The arrow key reached the terminal a moment after it was pressed.
    wake.noteKey(150)
    useAppStore.getState().recordTerminalInput(PANE, 152)

    await wake.check()

    expect(send).toHaveBeenCalledTimes(1)
  })

  it('counts printable keys, pastes and IME input as a possible draft, and nothing else', () => {
    const key = (
      value: string,
      extra: Partial<Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'shiftKey' | 'isComposing'>> = {}
    ) => ({
      key: value,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      isComposing: false,
      ...extra
    })
    expect(mayLeaveLocalTaskDispatcherDraft(key('a'))).toBe(true)
    expect(mayLeaveLocalTaskDispatcherDraft(key(' '))).toBe(true)
    expect(mayLeaveLocalTaskDispatcherDraft(key('v', { metaKey: true }))).toBe(true)
    expect(mayLeaveLocalTaskDispatcherDraft(key('Insert', { shiftKey: true }))).toBe(true)
    expect(mayLeaveLocalTaskDispatcherDraft(key('Process'))).toBe(true)
    expect(mayLeaveLocalTaskDispatcherDraft(key('c', { metaKey: true }))).toBe(false)
    expect(mayLeaveLocalTaskDispatcherDraft(key('c', { ctrlKey: true }))).toBe(false)
    expect(mayLeaveLocalTaskDispatcherDraft(key('ArrowUp'))).toBe(false)
    expect(mayLeaveLocalTaskDispatcherDraft(key('Escape'))).toBe(false)
    expect(mayLeaveLocalTaskDispatcherDraft(key('Enter'))).toBe(false)
  })
})
