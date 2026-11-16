import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'
import { TOGGLE_FLOATING_TERMINAL_EVENT } from '@/lib/floating-terminal'
import { makeRepo, makeTab, makeWorktree } from './ActivityPrototypePage-test-fixtures'
import type { AgentPaneThread } from './activity-thread-types'

const mocks = vi.hoisted(() => ({
  getState: vi.fn(),
  activateTabAndFocusPane: vi.fn(),
  activateStructuredAgentSessionTab: vi.fn(),
  activateAndRevealWorkspace: vi.fn(),
  dispatchEvent: vi.fn()
}))

vi.mock('@/store', () => ({ useAppStore: { getState: mocks.getState } }))
vi.mock('@/lib/activate-tab-and-focus-pane', () => ({
  activateTabAndFocusPane: mocks.activateTabAndFocusPane
}))
vi.mock('@/lib/agent-session/structured-agent-session-tab-activation', () => ({
  activateStructuredAgentSessionTab: mocks.activateStructuredAgentSessionTab
}))
vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealWorkspace: mocks.activateAndRevealWorkspace
}))

import { createActivityThreadActions, hasActivityThreadWorkspace } from './activity-thread-actions'

const REMOTE_HOST = 'ssh:devbox' as const

function makeRemoteThread(): AgentPaneThread {
  const worktree = { ...makeWorktree(), hostId: REMOTE_HOST }
  return {
    paneKey: 'tab-1:11111111-1111-4111-8111-111111111111',
    paneTitle: 'Remote agent',
    agentType: 'claude',
    worktree,
    repo: makeRepo(),
    tab: makeTab(),
    events: [],
    latestEvent: null,
    latestTimestamp: 1_000,
    currentAgentState: 'working',
    currentAgentEntry: null,
    unread: true,
    responsePreview: ''
  }
}

describe('activity thread host routing', () => {
  const thread = makeRemoteThread()
  const getKnownWorktreeById = vi.fn()
  const setActiveWorktree = vi.fn()
  const acknowledgeAgents = vi.fn()
  const setSelectedPaneKey = vi.fn()
  let state: Record<string, unknown>

  function makeActions(): ReturnType<typeof createActivityThreadActions> {
    return createActivityThreadActions({
      getMarkAllReadThreads: () => [thread],
      acknowledgeAgents,
      unacknowledgeAgents: vi.fn(),
      setSelectedPaneKey
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('window', { dispatchEvent: mocks.dispatchEvent })
    mocks.activateStructuredAgentSessionTab.mockReturnValue(false)
    mocks.activateAndRevealWorkspace.mockReturnValue({ primaryTabId: null })
    getKnownWorktreeById.mockReturnValue(thread.worktree)
    state = {
      getKnownWorktreeById,
      worktreesByRepo: { [thread.worktree.repoId]: [thread.worktree] },
      detectedWorktreesByRepo: {},
      folderWorkspaces: [],
      showSleepingWorkspaces: true,
      filterRepoIds: [],
      hideDefaultBranchWorkspace: false,
      hideAutomationGeneratedWorkspaces: false,
      hideCliCreatedWorkspaces: false,
      hideDetachedHeadWorkspaces: false,
      hideWorkspacesFromOtherDevices: false,
      alwaysShowDefaultBranchWorkspace: true,
      visibleWorkspaceHostIds: null,
      workspaceHostScope: 'all',
      tabsByWorktree: { [thread.worktree.id]: [thread.tab] },
      terminalLayoutsByTabId: {},
      runtimePaneTitlesByTabId: {},
      unifiedTabsByWorktree: {},
      activeRepoId: thread.worktree.repoId,
      activeWorktreeId: thread.worktree.id,
      activeWorkspaceExecutionHostId: 'local',
      setActiveRepo: vi.fn(),
      setActiveWorktree,
      setActiveTabType: vi.fn(),
      setTabViewMode: vi.fn()
    }
    mocks.getState.mockImplementation(() => state)
  })

  afterEach(() => vi.unstubAllGlobals())

  function makeFloatingThread(): AgentPaneThread {
    return {
      ...thread,
      worktree: { ...thread.worktree, id: FLOATING_TERMINAL_WORKTREE_ID },
      repo: null,
      tab: { ...thread.tab, worktreeId: FLOATING_TERMINAL_WORKTREE_ID }
    }
  }

  it.each([false, true])(
    'reveals the floating agent pane when the panel is open=%s without switching workspace',
    (open) => {
      const floatingThread = makeFloatingThread()
      state.settings = { floatingTerminalEnabled: true }
      state.tabsByWorktree = { [FLOATING_TERMINAL_WORKTREE_ID]: [floatingThread.tab] }
      mocks.activateAndRevealWorkspace.mockReturnValue(false)
      state.floatingWorkspacePanelOpen = open

      makeActions().selectThread(floatingThread)

      expect(setSelectedPaneKey).toHaveBeenCalledWith(floatingThread.paneKey)
      expect(mocks.activateAndRevealWorkspace).not.toHaveBeenCalled()
      expect(setActiveWorktree).not.toHaveBeenCalled()
      expect(mocks.dispatchEvent).toHaveBeenCalledTimes(open ? 0 : 1)
      if (!open) {
        expect(mocks.dispatchEvent).toHaveBeenCalledWith(
          expect.objectContaining({ type: TOGGLE_FLOATING_TERMINAL_EVENT })
        )
      }
      expect(mocks.activateTabAndFocusPane).toHaveBeenCalledWith(
        floatingThread.tab.id,
        '11111111-1111-4111-8111-111111111111',
        { flashFocusedPane: true, scrollToBottomIfOutputSinceLastView: true }
      )
    }
  )

  it('enables a disabled floating workspace before revealing its agent pane', async () => {
    const floatingThread = makeFloatingThread()
    const updateSettings = vi.fn().mockResolvedValue(undefined)
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame)
    state.settings = { floatingTerminalEnabled: false }
    state.updateSettings = updateSettings
    state.tabsByWorktree = { [FLOATING_TERMINAL_WORKTREE_ID]: [floatingThread.tab] }

    makeActions().selectThread(floatingThread)

    expect(updateSettings).toHaveBeenCalledWith({ floatingTerminalEnabled: true })
    expect(mocks.dispatchEvent).not.toHaveBeenCalled()
    expect(mocks.activateTabAndFocusPane).toHaveBeenCalled()
    await vi.waitFor(() => expect(requestAnimationFrame).toHaveBeenCalledTimes(1))
    expect(mocks.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: TOGGLE_FLOATING_TERMINAL_EVENT })
    )
  })

  it('opens the floating panel on a floating chat row once its tab is activated', () => {
    state.settings = { floatingTerminalEnabled: true }
    state.floatingWorkspacePanelOpen = false
    mocks.activateStructuredAgentSessionTab.mockReturnValue(true)

    makeActions().selectThread(makeFloatingThread())

    expect(mocks.activateAndRevealWorkspace).not.toHaveBeenCalled()
    expect(mocks.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: TOGGLE_FLOATING_TERMINAL_EVENT })
    )
  })

  it('does not open the floating panel for a retained thread whose tab was closed', () => {
    makeActions().selectThread(makeFloatingThread())

    expect(mocks.activateAndRevealWorkspace).not.toHaveBeenCalled()
    expect(mocks.dispatchEvent).not.toHaveBeenCalled()
    expect(mocks.activateTabAndFocusPane).not.toHaveBeenCalled()
  })

  it('routes the row click through the full activation sequence for the matching host', () => {
    makeActions().selectThread(thread)

    // Workspace activation must switch views, seed terminals and resume sleeping sessions; bare setActiveWorktree skips these.
    expect(mocks.activateAndRevealWorkspace).toHaveBeenCalledWith(thread.worktree.id, {
      executionHostId: REMOTE_HOST,
      revealInSidebar: false,
      clearSidebarFilters: false
    })
    expect(setActiveWorktree).not.toHaveBeenCalled()
    expect(mocks.activateTabAndFocusPane).toHaveBeenCalledWith(
      thread.tab.id,
      '11111111-1111-4111-8111-111111111111',
      { flashFocusedPane: true, scrollToBottomIfOutputSinceLastView: true }
    )
  })

  it.each([false, true])(
    'reveals the original terminal pane for an unbound restored chat, floating=%s',
    (floating) => {
      const target = floating ? makeFloatingThread() : thread
      const restored = {
        ...target,
        tab: { ...target.tab, viewMode: 'chat' as const },
        paneEntry: {
          paneKey: target.paneKey,
          state: 'waiting' as const,
          prompt: '',
          updatedAt: 2_000,
          stateStartedAt: 2_000,
          stateHistory: [],
          restoredUnconfirmed: true
        }
      }
      state.tabsByWorktree = { [restored.worktree.id]: [restored.tab] }
      state.terminalLayoutsByTabId = {
        [restored.tab.id]: {
          root: { type: 'leaf', leafId: '11111111-1111-4111-8111-111111111111' },
          activeLeafId: '11111111-1111-4111-8111-111111111111',
          expandedLeafId: null,
          ptyIdsByLeafId: {
            '11111111-1111-4111-8111-111111111111': restored.tab.ptyId
          }
        }
      }
      if (floating) {
        state.settings = { floatingTerminalEnabled: true }
        state.floatingWorkspacePanelOpen = false
      }

      makeActions().selectThread(restored)

      expect(state.setTabViewMode).toHaveBeenCalledWith(restored.tab.id, 'terminal')
      expect(mocks.activateStructuredAgentSessionTab).toHaveBeenCalledOnce()
      if (floating) {
        expect(mocks.activateAndRevealWorkspace).not.toHaveBeenCalled()
        expect(mocks.dispatchEvent).toHaveBeenCalledWith(
          expect.objectContaining({ type: TOGGLE_FLOATING_TERMINAL_EVENT })
        )
      } else {
        expect(mocks.activateAndRevealWorkspace).toHaveBeenCalledOnce()
      }
      expect(mocks.activateTabAndFocusPane).toHaveBeenCalledWith(
        restored.tab.id,
        '11111111-1111-4111-8111-111111111111',
        { flashFocusedPane: true, scrollToBottomIfOutputSinceLastView: true }
      )
    }
  )

  it.each([
    { binding: 'target', revealsTerminal: true },
    { binding: 'sibling', revealsTerminal: false }
  ] as const)(
    'uses the target floating split leaf binding when tab PTY is pending: $binding',
    ({ binding, revealsTerminal }) => {
      const target = makeFloatingThread()
      const targetLeafId = '11111111-1111-4111-8111-111111111111'
      const siblingLeafId = '22222222-2222-4222-8222-222222222222'
      const restored = {
        ...target,
        tab: { ...target.tab, ptyId: null, viewMode: 'chat' as const },
        paneEntry: {
          paneKey: target.paneKey,
          state: 'waiting' as const,
          prompt: '',
          updatedAt: 2_000,
          stateStartedAt: 2_000,
          stateHistory: [],
          restoredUnconfirmed: true
        }
      }
      state.settings = { floatingTerminalEnabled: true }
      state.floatingWorkspacePanelOpen = true
      state.tabsByWorktree = { [restored.worktree.id]: [restored.tab] }
      state.terminalLayoutsByTabId = {
        [restored.tab.id]: {
          root: {
            type: 'split',
            direction: 'vertical',
            first: { type: 'leaf', leafId: targetLeafId },
            second: { type: 'leaf', leafId: siblingLeafId }
          },
          activeLeafId: binding === 'target' ? siblingLeafId : targetLeafId,
          expandedLeafId: null,
          ptyIdsByLeafId: {
            [binding === 'target' ? targetLeafId : siblingLeafId]: 'remote:paired@@original-pty'
          }
        }
      }

      makeActions().selectThread(restored)

      if (revealsTerminal) {
        expect(state.setTabViewMode).toHaveBeenCalledWith(restored.tab.id, 'terminal')
      } else {
        expect(state.setTabViewMode).not.toHaveBeenCalled()
      }
      expect(mocks.activateAndRevealWorkspace).not.toHaveBeenCalled()
      expect(mocks.activateTabAndFocusPane).toHaveBeenCalledWith(restored.tab.id, targetLeafId, {
        flashFocusedPane: true,
        scrollToBottomIfOutputSinceLastView: true
      })
    }
  )

  it('keeps the chat view for a freshly bound row', () => {
    const bound = {
      ...thread,
      tab: { ...thread.tab, viewMode: 'chat' as const },
      paneEntry: {
        paneKey: thread.paneKey,
        state: 'waiting' as const,
        prompt: '',
        updatedAt: 2_000,
        stateStartedAt: 2_000,
        stateHistory: [],
        providerSession: { key: 'session_id' as const, id: 'known-session' }
      }
    }
    state.tabsByWorktree = { [bound.worktree.id]: [bound.tab] }

    makeActions().selectThread(bound)

    expect(state.setTabViewMode).not.toHaveBeenCalled()
    expect(mocks.activateTabAndFocusPane).toHaveBeenCalledWith(
      bound.tab.id,
      '11111111-1111-4111-8111-111111111111',
      { flashFocusedPane: true, scrollToBottomIfOutputSinceLastView: true }
    )
  })

  it('opens a cold-parked remote thread whose tab activation revives', () => {
    // A cold SSH tab becomes resident only during activation; probing before it made clicks silent no-ops.
    state.tabsByWorktree = {}
    mocks.activateAndRevealWorkspace.mockImplementation(() => {
      state.tabsByWorktree = { [thread.worktree.id]: [thread.tab] }
      return { primaryTabId: thread.tab.id }
    })

    makeActions().selectThread(thread)

    expect(setSelectedPaneKey).toHaveBeenCalledWith(thread.paneKey)
    expect(mocks.activateAndRevealWorkspace).toHaveBeenCalledWith(thread.worktree.id, {
      executionHostId: REMOTE_HOST,
      revealInSidebar: false,
      clearSidebarFilters: false
    })
    expect(mocks.activateTabAndFocusPane).toHaveBeenCalledWith(
      thread.tab.id,
      '11111111-1111-4111-8111-111111111111',
      { flashFocusedPane: true, scrollToBottomIfOutputSinceLastView: true }
    )
  })

  it('still activates the workspace when a retained thread has no tab to focus', () => {
    state.tabsByWorktree = {}

    makeActions().selectThread(thread)

    expect(mocks.activateAndRevealWorkspace).toHaveBeenCalledWith(thread.worktree.id, {
      executionHostId: REMOTE_HOST,
      revealInSidebar: false,
      clearSidebarFilters: false
    })
    expect(mocks.activateTabAndFocusPane).not.toHaveBeenCalled()
  })

  it('focuses nothing when the workspace itself is gone', () => {
    mocks.activateAndRevealWorkspace.mockReturnValue(false)

    makeActions().selectThread(thread)

    expect(mocks.activateStructuredAgentSessionTab).not.toHaveBeenCalled()
    expect(mocks.activateTabAndFocusPane).not.toHaveBeenCalled()
  })

  it('activates a structured agent session instead of looking for a terminal pane', () => {
    mocks.activateStructuredAgentSessionTab.mockReturnValue(true)
    state.tabsByWorktree = { [thread.worktree.id]: [] }
    state.unifiedTabsByWorktree = {
      [thread.worktree.id]: [{ id: thread.tab.id, contentType: 'agent-session' }]
    }

    makeActions().selectThread(thread)

    expect(mocks.activateStructuredAgentSessionTab).toHaveBeenCalledWith({
      worktreeId: thread.worktree.id,
      tabId: thread.tab.id
    })
    expect(mocks.activateTabAndFocusPane).not.toHaveBeenCalled()
  })

  it('jumps to and probes the matching host-qualified workspace', () => {
    expect(hasActivityThreadWorkspace(thread)).toBe(true)

    makeActions().jumpToWorkspace(thread)

    expect(acknowledgeAgents).toHaveBeenCalledWith([thread.paneKey], undefined, 'explicit')
    expect(mocks.activateAndRevealWorkspace).toHaveBeenCalledWith(thread.worktree.id, {
      navigationIntent: 'user-open',
      showWorkspaceList: true,
      executionHostId: REMOTE_HOST
    })
  })

  it('marks all unread threads in the mark-all set, reading it at call time', () => {
    const readThread = { ...makeRemoteThread(), paneKey: 'tab-2:read', unread: false }
    let markAllSet = [readThread]
    const actions = createActivityThreadActions({
      getMarkAllReadThreads: () => markAllSet,
      acknowledgeAgents,
      unacknowledgeAgents: vi.fn(),
      setSelectedPaneKey
    })

    actions.markAllThreadsRead()
    expect(acknowledgeAgents).not.toHaveBeenCalled()

    // The handler keeps one identity while the set changes underneath it.
    markAllSet = [thread, readThread]
    actions.markAllThreadsRead()
    expect(acknowledgeAgents).toHaveBeenCalledWith([thread.paneKey], undefined, 'explicit')
  })

  it('marks a batch of threads read or unread in one store update', () => {
    const other = { ...makeRemoteThread(), paneKey: 'tab-2:other' }
    const unacknowledgeAgents = vi.fn()
    const actions = createActivityThreadActions({
      getMarkAllReadThreads: () => [],
      acknowledgeAgents,
      unacknowledgeAgents,
      setSelectedPaneKey
    })

    actions.markThreadsRead([thread, other])
    actions.markThreadsUnread([thread, other])
    expect(acknowledgeAgents).toHaveBeenCalledExactlyOnceWith(
      [thread.paneKey, other.paneKey],
      undefined,
      'explicit'
    )
    expect(unacknowledgeAgents).toHaveBeenCalledExactlyOnceWith([thread.paneKey, other.paneKey])
  })
})
