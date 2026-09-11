import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { AiVaultSessionTitlesResult } from '../../../shared/ai-vault-session-title'
import { dispatchTerminalNotification } from '../components/terminal-pane/use-notification-dispatch'
import { fixture, nativeResult, PANE, LEAF, SIBLING } from './session-name-binding-test-fixture'
import { captureNotificationSessionName } from './notification-session-name'
import { sessionNameStore } from './session-name-store'
import {
  canonicalSessionTitleKey,
  registerCanonicalSessionTitleProvider
} from '../lib/canonical-session-titles'
import { getDefaultSettings } from '../../../shared/constants'
import type { NotificationDispatchRequest } from '../../../shared/notification-settings-types'
import { startAiVaultTabTitleSync } from '../lib/ai-vault-tab-title-sync'

let store: ReturnType<typeof fixture>
const stops: (() => void)[] = []
const dispatch = vi.fn(async (_args: NotificationDispatchRequest) => ({
  delivered: false,
  reason: 'disabled'
}))
const read = vi.fn(async (): Promise<AiVaultSessionTitlesResult> => ({ titles: [] }))
vi.mock('@/store', () => ({ useAppStore: { getState: () => store.getState() } }))
vi.mock('@/runtime/sync-runtime-graph', () => ({ scheduleRuntimeGraphSync: vi.fn() }))
vi.mock('@/lib/desktop-notification-sound', () => ({ playDesktopNotificationSound: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
  read.mockResolvedValue({ titles: [] })
  store = fixture()
  store.setState((state) => ({
    repos: [],
    ptyIdsByTabId: { tab: ['leaf-pty'] },
    suppressedPtyExitIds: {},
    settings: getDefaultSettings('/workspace'),
    markWorktreeUnread: vi.fn(),
    markAgentCompletionPaneUnread: vi.fn(),
    markTerminalTabUnread: vi.fn(),
    markTerminalPaneUnread: vi.fn(),
    agentStatusByPaneKey: {
      [PANE]: {
        ...state.agentStatusByPaneKey[PANE],
        state: 'done',
        stateStartedAt: Date.now(),
        updatedAt: Date.now(),
        prompt: '继续',
        lastAssistantMessage: 'The patch is ready.'
      }
    }
  }))
  vi.stubGlobal('document', { visibilityState: 'hidden', hasFocus: () => false })
  vi.stubGlobal('window', {
    api: { notifications: { dispatch }, aiVault: { resolveSessionTitles: read } }
  })
})
afterEach(() => {
  stops.splice(0).forEach((stop) => stop())
  sessionNameStore.reset()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('times out once with the captured prompt fallback, not the latest round or replacement name', async () => {
  vi.useFakeTimers()
  let finish!: (value: AiVaultSessionTitlesResult) => void
  read.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  sessionNameStore.publish('ssh:dev-box', {
    titles: [
      {
        agent: 'codex',
        sessionId: 'A',
        title: 'Implement retry handling',
        generatedTitle: 'Implement retry handling',
        providerName: { kind: 'absent' }
      }
    ]
  })
  send()
  expect(store.getState().markWorktreeUnread).toHaveBeenCalledExactlyOnceWith('workspace')
  await vi.advanceTimersByTimeAsync(1499)
  expect(dispatch).not.toHaveBeenCalled()
  store.replaceIdentity('B')
  sessionNameStore.publish('ssh:dev-box', nativeResult('B name', 'B'))
  await vi.advanceTimersByTimeAsync(1)
  expect(dispatch).toHaveBeenCalledWith(
    expect.objectContaining({
      sessionTitle: 'Implement retry handling',
      agentPrompt: '继续'
    })
  )
  finish(nativeResult('Late A name'))
  await vi.advanceTimersByTimeAsync(0)
  expect(dispatch).toHaveBeenCalledTimes(1)
})

it('uses an existing manual fallback when the provider has no native name', async () => {
  const index = new Map([
    [canonicalSessionTitleKey('ssh:dev-box', 'codex', 'A'), 'Manual fallback']
  ])
  stops.push(
    registerCanonicalSessionTitleProvider({
      get: (host, agent, id) => index.get(canonicalSessionTitleKey(host, agent, id)),
      index: () => index,
      subscribe: () => () => {}
    })
  )
  read.mockResolvedValue({
    titles: [],
    nameEvidence: [
      {
        agent: 'codex',
        sessionId: 'A',
        providerName: { kind: 'absent' },
        generatedTitle: 'Implement retry handling'
      }
    ]
  })
  send()
  await vi.waitFor(() =>
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ sessionTitle: 'Manual fallback' })
    )
  )
})

it('does not borrow the current B container name for an already captured A event', async () => {
  const eventStatus = store.getState().agentStatusByPaneKey[PANE]
  store.replaceIdentity('B')
  store.setState((state) => ({
    tabsByWorktree: {
      workspace: [
        {
          ...state.tabsByWorktree.workspace[0],
          customTitle: 'B label',
          generatedTitle: 'B task',
          aiVaultTitle: nativeResult('B native', 'B').titles[0]
        }
      ]
    }
  }))
  expect(
    await captureNotificationSessionName(store.getState(), {
      worktreeId: 'workspace',
      paneKey: PANE,
      terminalTitle: 'Codex ready',
      agentStatus: eventStatus
    })
  ).toBe('Codex A')
})

it('does not borrow an old generated title when the event has no session identity', async () => {
  store.setState((state) => ({
    settings: { ...state.settings!, tabAutoGenerateTitle: true },
    agentStatusByPaneKey: {
      [PANE]: { ...state.agentStatusByPaneKey[PANE], providerSession: undefined }
    },
    tabsByWorktree: {
      workspace: [
        {
          ...state.tabsByWorktree.workspace[0],
          generatedTitle: 'Old A task',
          aiVaultTitle: nativeResult('Old A name').titles[0]
        }
      ]
    }
  }))
  send()
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ terminalTitle: 'Codex ready' }))
  expect(dispatch.mock.calls[0]?.[0]).not.toHaveProperty('sessionTitle')
})

it('uses the own-session native name for a terminal bell without adding a completion snapshot', () => {
  sessionNameStore.publish('ssh:dev-box', nativeResult('Bell task'))
  dispatchTerminalNotification('workspace', {
    source: 'terminal-bell',
    paneKey: PANE,
    terminalTitle: 'Codex ready'
  })
  expect(dispatch).toHaveBeenCalledWith(
    expect.objectContaining({ source: 'terminal-bell', sessionTitle: 'Bell task' })
  )
  expect(dispatch.mock.calls[0]?.[0]).not.toHaveProperty('agentPrompt')
})

it('does not lend a Codex name to a different provider terminal bell', () => {
  sessionNameStore.publish('ssh:dev-box', nativeResult('Wrong Codex task'))
  dispatchTerminalNotification('workspace', {
    source: 'terminal-bell',
    paneKey: PANE,
    terminalTitle: 'Claude Code'
  })
  expect(dispatch.mock.calls[0]?.[0]).not.toHaveProperty('sessionTitle')
  expect(read).not.toHaveBeenCalled()
})

it('keeps the fresh owned native name on process exit without borrowing an unfinished reply', () => {
  store.setState((state) => ({
    agentStatusByPaneKey: {
      [PANE]: {
        ...state.agentStatusByPaneKey[PANE],
        state: 'working',
        lastAssistantMessage: 'Still working'
      }
    }
  }))
  sessionNameStore.publish('ssh:dev-box', nativeResult('Exited task'))
  dispatchTerminalNotification('workspace', {
    source: 'agent-task-complete',
    agentCompletionSource: 'process-exit',
    paneKey: PANE,
    terminalTitle: 'Codex ready'
  })
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ sessionTitle: 'Exited task' }))
  expect(dispatch.mock.calls[0]?.[0]).not.toHaveProperty('agentLastAssistantMessage')
  expect(dispatch.mock.calls[0]?.[0]).not.toHaveProperty('agentState')
})

it.each(['stale', 'different-agent'] as const)(
  'does not borrow a %s identity on process exit',
  (reason) => {
    store.setState((state) => ({
      agentStatusByPaneKey: {
        [PANE]: {
          ...state.agentStatusByPaneKey[PANE],
          state: 'working',
          updatedAt: Date.now() - (reason === 'stale' ? 20_000 : 0)
        }
      }
    }))
    sessionNameStore.publish('ssh:dev-box', nativeResult('Wrong old task'))
    dispatchTerminalNotification('workspace', {
      source: 'agent-task-complete',
      agentCompletionSource: 'process-exit',
      paneKey: PANE,
      terminalTitle: reason === 'stale' ? 'Codex ready' : 'Claude Code'
    })
    expect(dispatch.mock.calls[0]?.[0]).not.toHaveProperty('sessionTitle')
    expect(read).not.toHaveBeenCalled()
  }
)

it('uses the inactive split pane name, never the selected sibling slot', () => {
  sessionNameStore.publish('ssh:dev-box', nativeResult('Own A name'))
  store.setState((state) => ({
    terminalLayoutsByTabId: {
      tab: {
        ...state.terminalLayoutsByTabId.tab,
        root: {
          type: 'split',
          direction: 'horizontal',
          first: { type: 'leaf', leafId: LEAF },
          second: { type: 'leaf', leafId: SIBLING }
        },
        activeLeafId: SIBLING,
        ptyIdsByLeafId: { [LEAF]: 'leaf-pty', [SIBLING]: 'sibling-pty' }
      }
    },
    tabsByWorktree: {
      workspace: [
        {
          ...state.tabsByWorktree.workspace[0],
          customTitle: 'Sibling label',
          aiVaultTitle: nativeResult('Sibling native', 'B').titles[0]
        }
      ]
    }
  }))
  send()
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ sessionTitle: 'Own A name' }))
})

function send() {
  dispatchTerminalNotification('workspace', {
    source: 'agent-task-complete',
    paneKey: PANE,
    terminalTitle: 'Codex ready',
    agentStatusSnapshot: store.getState().agentStatusByPaneKey[PANE]
  })
}

it.each(['ssh:folder-box', 'runtime:paired-box'] as const)(
  'routes an inactive folder event to its own %s host',
  async (executionHostId) => {
    store.setState({
      activeWorktreeId: 'another-local-workspace',
      activeWorkspaceExecutionHostId: 'local',
      folderWorkspaces: [
        {
          id: 'f',
          projectGroupId: 'g',
          executionHostId,
          name: 'Folder',
          folderPath: '/remote/folder',
          linkedTask: null,
          comment: '',
          isArchived: false,
          isUnread: false,
          isPinned: false,
          sortOrder: 0,
          lastActivityAt: 1,
          createdAt: 1,
          updatedAt: 1
        }
      ]
    })
    sessionNameStore.publish('local', nativeResult('Wrong local A'))
    read.mockResolvedValue(nativeResult('Own remote folder A'))
    expect(
      await captureNotificationSessionName(store.getState(), {
        worktreeId: 'folder:f',
        paneKey: PANE,
        terminalTitle: 'Codex ready',
        agentStatus: store.getState().agentStatusByPaneKey[PANE]
      })
    ).toBe('Own remote folder A')
    expect(read).toHaveBeenCalledExactlyOnceWith({
      executionHostScope: executionHostId,
      requests: [{ agent: 'codex', sessionId: 'A' }]
    })
  }
)

it.each(['Provider task name', '继续'])(
  'captures native %s without replacing raw event content',
  (title) => {
    const index = new Map([
      [canonicalSessionTitleKey('ssh:dev-box', 'codex', 'A'), 'Manual fallback']
    ])
    stops.push(
      registerCanonicalSessionTitleProvider({
        get: (host, agent, id) => index.get(canonicalSessionTitleKey(host, agent, id)),
        index: () => index,
        subscribe: () => () => {}
      })
    )
    sessionNameStore.publish('local', nativeResult('Wrong local name'))
    sessionNameStore.publish('ssh:dev-box', nativeResult(title))
    send()
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionTitle: title,
        terminalTitle: 'Codex ready',
        agentPrompt: '继续',
        agentLastAssistantMessage: 'The patch is ready.',
        paneKey: PANE
      })
    )
    expect(read).not.toHaveBeenCalled()
  }
)

it.each([false, true])(
  'keeps the cold event read separate from live binding invalidation (ABA=%s)',
  async (returnsToA) => {
    let finish!: (value: AiVaultSessionTitlesResult) => void
    read.mockResolvedValue(nativeResult('Current A name')).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    stops.push(
      startAiVaultTabTitleSync({
        getState: store.getState,
        subscribe: store.subscribe,
        resolveSessionTitles: sessionNameStore.resolveSessionTitles,
        invalidateSessionNames: (requests) =>
          sessionNameStore.invalidate(
            requests.map((request) => ({
              executionHostId: request.executionHostId,
              agent: request.agent,
              sessionId: request.providerSession.id
            }))
          )
      })
    )
    send()
    await vi.waitFor(() =>
      expect(read).toHaveBeenCalledExactlyOnceWith({
        executionHostScope: 'ssh:dev-box',
        requests: [{ agent: 'codex', sessionId: 'A' }]
      })
    )
    store.replaceIdentity('B')
    sessionNameStore.publish('ssh:dev-box', nativeResult('B name', 'B'))
    if (returnsToA) {
      store.replaceIdentity('A')
      await vi.waitFor(() => expect(store.slot()?.title).toBe('Current A name'))
      expect(dispatch).not.toHaveBeenCalled()
    }
    finish(nativeResult('A captured name'))
    await vi.waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionTitle: 'A captured name',
          agentLastAssistantMessage: 'The patch is ready.'
        })
      )
    )
    expect(dispatch).toHaveBeenCalledTimes(1)
    if (returnsToA) {
      await vi.waitFor(() => expect(store.slot()?.title).toBe('Current A name'))
      expect(
        sessionNameStore.getSnapshot().get(canonicalSessionTitleKey('ssh:dev-box', 'codex', 'A'))
          ?.title
      ).toBe('Current A name')
    } else {
      expect(store.slot()?.sessionId).not.toBe('A')
    }
  }
)
