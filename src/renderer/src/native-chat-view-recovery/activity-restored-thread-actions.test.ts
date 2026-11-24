import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../shared/workspace/identity/floating-workspace-id'
import { TOGGLE_FLOATING_TERMINAL_EVENT } from '@/components/floating-terminal/workspace/floating-workspace-open-intent'
import type { AgentPaneThread } from '../components/activity/threads/activity-thread-types'
import { makeRepo, makeTab, makeWorktree } from './activity-restored-test-fixtures'

const mocks = vi.hoisted(() => ({
  getState: vi.fn(),
  activateTabAndFocusPane: vi.fn(),
  activateStructuredAgentSessionTab: vi.fn(),
  activateAndRevealWorkspace: vi.fn(),
  dispatchEvent: vi.fn()
}))

vi.mock('@/store/index', () => ({ useAppStore: { getState: mocks.getState } }))
vi.mock('@/lib/workspace/tabs/activate-tab-and-focus-pane', () => ({
  activateTabAndFocusPane: mocks.activateTabAndFocusPane
}))
vi.mock('@/lib/agent-session/structured-agent-session-tab-activation', () => ({
  activateStructuredAgentSessionTab: mocks.activateStructuredAgentSessionTab
}))
vi.mock('@/lib/workspace/activation/worktree-activation', () => ({
  activateAndRevealWorkspace: mocks.activateAndRevealWorkspace
}))

import { createActivityThreadActions } from '../components/activity/thread-list/activity-thread-actions'

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

// Ported from the upstream activity-thread-actions suite that upstream retired as low-value (#39365).
describe('activity restored terminal reveal', () => {
  const thread = makeRemoteThread()
  const getKnownWorktreeById = vi.fn()
  const setActiveWorktree = vi.fn()
  let state: Record<string, unknown>

  function makeActions(): ReturnType<typeof createActivityThreadActions> {
    return createActivityThreadActions({
      getMarkAllReadThreads: () => [thread],
      acknowledgeAgents: vi.fn(),
      unacknowledgeAgents: vi.fn(),
      setSelectedPaneKey: vi.fn()
    })
  }

  function makeFloatingThread(): AgentPaneThread {
    return {
      ...thread,
      worktree: { ...thread.worktree, id: FLOATING_TERMINAL_WORKTREE_ID },
      repo: null,
      tab: { ...thread.tab, worktreeId: FLOATING_TERMINAL_WORKTREE_ID }
    }
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
})
