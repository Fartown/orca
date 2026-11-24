// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from 'vitest'
import { acceptedAgentStatuses } from '@/store/slices/agent-status/status-ownership/accepted-agent-statuses'
import type { AgentStatusEntry } from '../../../shared/agent-status/contracts/agent-status-types'
import type { Tab } from '../../../shared/workspace-layout/tab-groups/tab-types'
const fixture = vi.hoisted(() => ({
  launch: vi.fn(),
  register: vi.fn(),
  prepare: vi.fn(),
  view: vi.fn(),
  find: vi.fn(),
  activateOwner: vi.fn(),
  reveal: vi.fn(() => true),
  preferences: vi.fn(),
  panel: vi.fn()
}))
vi.mock('@/store', async () => {
  const { createTestStore } = await import('@/store/testing/app-store-test-fixture')
  return { useAppStore: createTestStore() }
})
vi.mock('@/lib/agent-session/messaging/terminal/active-agent-note-target', () => ({
  findActiveRuntimeTerminal: fixture.find
}))
vi.mock('@/lib/workspace/tabs/terminal-tab-owner-activation', () => ({
  activateTerminalTabOnOwner: fixture.activateOwner
}))
vi.mock('@/lib/workspace/activation/reveal-terminal-pane', () => ({
  revealTerminalPane: fixture.reveal
}))
vi.mock('@/runtime/rpc/compatibility/runtime-capability-proof', () => ({
  runtimeEnvironmentSupportsCapability: async () => true
}))
vi.mock('@/lib/agent-session/launch/new-tab/launch-agent-in-new-tab', () => ({
  launchAgentInNewTabWithOutcome: fixture.launch
}))
vi.mock('./local-task-dispatcher-client', () => ({
  localTaskDispatcherClientFor: () => ({
    register: fixture.register,
    prepareWorkspace: fixture.prepare,
    readPreferences: fixture.preferences
  })
}))
import { useAppStore } from '@/store'
import { makeWorktree } from '@/store/slices/worktrees/worktree.test-fixture'
import { TEST_REPO } from '@/store/repos/repo.test-fixture'
import { localTasksDomainStore } from './local-tasks-domain-store'
import {
  localTaskDispatcherStore,
  selectLocalTaskDispatcherEndpoint
} from './local-task-dispatcher-source'
import {
  bindLocalTaskDispatcherPresentation,
  getLocalTaskDispatcherSendArgs,
  openLocalTaskDispatcher
} from './local-task-dispatcher-session'

const LEAF = '11111111-1111-4111-8111-111111111111'
const PANE = `dispatcher-tab:${LEAF}`
const WORKTREE = 'global-floating-terminal'
const tab: Tab = {
  id: 'unified-dispatcher',
  entityId: 'dispatcher-tab',
  worktreeId: WORKTREE,
  groupId: 'g',
  contentType: 'terminal',
  label: 'Dispatcher',
  customLabel: null,
  color: null,
  sortOrder: 0,
  createdAt: 1,
  viewMode: 'chat'
}
function status(extra: Partial<AgentStatusEntry> = {}): AgentStatusEntry {
  return {
    paneKey: PANE,
    state: 'waiting',
    prompt: '',
    updatedAt: 1,
    stateStartedAt: 1,
    stateHistory: [],
    agentType: 'claude',
    ...extra
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useAppStore.setState(useAppStore.getInitialState(), true)
  localTasksDomainStore.setState(localTasksDomainStore.getInitialState(), true)
  localTaskDispatcherStore.setState(localTaskDispatcherStore.getInitialState(), true)
  localTaskDispatcherStore.setState({ paneKey: PANE, worktreeId: WORKTREE })
  useAppStore.setState({
    setTabViewMode: fixture.view,
    setFloatingWorkspacePanelOpen: fixture.panel,
    unifiedTabsByWorktree: { [WORKTREE]: [tab] },
    terminalLayoutsByTabId: {
      'dispatcher-tab': {
        root: { type: 'leaf', leafId: LEAF },
        activeLeafId: LEAF,
        expandedLeafId: null,
        ptyIdsByLeafId: {}
      }
    }
  })
})

it('reveals a pre-hook trust wait in its existing terminal instead of an empty Chat, without launching another agent', async () => {
  const dispose = bindLocalTaskDispatcherPresentation()
  useAppStore.setState({ agentStatusByPaneKey: acceptedAgentStatuses([[PANE, status()]]) })
  expect(fixture.view).toHaveBeenCalledWith(tab.id, 'terminal')
  await expect(openLocalTaskDispatcher('claude')).resolves.toBe(true)
  expect(fixture.launch).not.toHaveBeenCalled()
  expect(fixture.register).not.toHaveBeenCalled()
  dispose()
})

it('keeps a provider-backed approval in Chat and does not keep forcing a user-selected view', () => {
  const dispose = bindLocalTaskDispatcherPresentation()
  useAppStore.setState({
    agentStatusByPaneKey: acceptedAgentStatuses([
      [
        PANE,
        status({
          providerSession: { key: 'session_id', id: 'claude-provider' },
          interactivePrompt: 'Approve the command?'
        })
      ]
    ])
  })
  expect(fixture.view).not.toHaveBeenCalled()
  useAppStore.setState({ agentStatusByPaneKey: acceptedAgentStatuses([[PANE, status()]]) })
  expect(fixture.view).toHaveBeenCalledTimes(1)
  useAppStore.setState({
    agentStatusByPaneKey: acceptedAgentStatuses([[PANE, status({ updatedAt: 2 })]])
  })
  expect(fixture.view).toHaveBeenCalledTimes(1)
  dispose()
})

it('refuses sends into startup prompts and fences an accepted paste before Enter if the source changes', () => {
  useAppStore.setState({ agentStatusByPaneKey: acceptedAgentStatuses([[PANE, status()]]) })
  expect(getLocalTaskDispatcherSendArgs(PANE, 'continue')).toBeNull()
  useAppStore.setState({
    agentStatusByPaneKey: acceptedAgentStatuses([
      [
        PANE,
        status({
          state: 'done',
          providerSession: { key: 'session_id', id: 'claude-provider' }
        })
      ]
    ])
  })
  const args = getLocalTaskDispatcherSendArgs(PANE, 'continue')
  expect(args?.worktreeId).toBe(WORKTREE)
  expect(args?.beforeTerminalSend?.('paste')).toBe(true)
  selectLocalTaskDispatcherEndpoint('runtime:mini')
  expect(args?.beforeTerminalSend?.('submit')).toBe(false)
})

it('does not launch locally when the selected remote source is out of contact', async () => {
  selectLocalTaskDispatcherEndpoint('runtime:mini')
  await expect(openLocalTaskDispatcher('claude')).resolves.toBe(false)
  expect(fixture.launch).not.toHaveBeenCalled()
  expect(fixture.prepare).not.toHaveBeenCalled()
})

it('handles a restored trust pane when its remembered dispatcher identity arrives after agent status', () => {
  localTaskDispatcherStore.setState({ paneKey: null })
  useAppStore.setState({ agentStatusByPaneKey: acceptedAgentStatuses([[PANE, status()]]) })
  const dispose = bindLocalTaskDispatcherPresentation()
  expect(fixture.view).not.toHaveBeenCalled()
  localTaskDispatcherStore.setState({ paneKey: PANE })
  expect(fixture.view).toHaveBeenCalledWith(tab.id, 'terminal')
  localTaskDispatcherStore.setState({ opening: false })
  expect(fixture.view).toHaveBeenCalledTimes(1)
  dispose()
})

it('requires the selected remote catalog and a unique terminal owner before sending to a remote dispatcher', () => {
  const worktreeId = 'repo1::/dispatcher'
  selectLocalTaskDispatcherEndpoint('runtime:mini')
  localTaskDispatcherStore.setState({ paneKey: PANE, worktreeId })
  const remoteTab: Tab = { ...tab, worktreeId, executionHostId: 'runtime:mini' }
  useAppStore.setState({
    runtimeStatusByEnvironmentId: new Map([
      [
        'mini',
        {
          checkedAt: 1,
          status: {
            runtimeId: 'mini-runtime',
            rendererGraphEpoch: 1,
            graphStatus: 'ready',
            authoritativeWindowId: 1,
            liveTabCount: 1,
            liveLeafCount: 1
          }
        }
      ]
    ]),
    unifiedTabsByWorktree: { [worktreeId]: [remoteTab] },
    repos: [{ ...TEST_REPO, executionHostId: 'runtime:mini' }],
    worktreesByRepo: {
      repo1: [makeWorktree({ id: worktreeId, repoId: 'repo1', hostId: 'runtime:mini' })]
    },
    agentStatusByPaneKey: acceptedAgentStatuses([
      [PANE, status({ state: 'done', providerSession: { key: 'session_id', id: 'mini-provider' } })]
    ])
  })
  const send = getLocalTaskDispatcherSendArgs(PANE, 'continue on mini')
  expect(send?.worktreeId).toBe(worktreeId)
  expect(send?.beforeTerminalSend?.('paste')).toBe(true)
  useAppStore.setState({
    unifiedTabsByWorktree: { [worktreeId]: [{ ...remoteTab, executionHostId: 'local' }] }
  })
  expect(send?.beforeTerminalSend?.('submit')).toBe(false)
  expect(getLocalTaskDispatcherSendArgs(PANE, 'continue')).toBeNull()
  useAppStore.setState({
    unifiedTabsByWorktree: { [worktreeId]: [remoteTab, { ...remoteTab, id: 'duplicate' }] }
  })
  expect(getLocalTaskDispatcherSendArgs(PANE, 'continue')).toBeNull()
  useAppStore.setState({
    unifiedTabsByWorktree: { [worktreeId]: [remoteTab] },
    runtimeStatusByEnvironmentId: new Map()
  })
  expect(getLocalTaskDispatcherSendArgs(PANE, 'continue')).toBeNull()
})

it('waits for a late unified tab before marking a restored startup wait handled', () => {
  useAppStore.setState({
    unifiedTabsByWorktree: {},
    agentStatusByPaneKey: acceptedAgentStatuses([[PANE, status()]])
  })
  const dispose = bindLocalTaskDispatcherPresentation()
  expect(fixture.view).not.toHaveBeenCalled()
  useAppStore.setState({ unifiedTabsByWorktree: { [WORKTREE]: [tab] } })
  expect(fixture.view).toHaveBeenCalledWith(tab.id, 'terminal')
  dispose()
})

it('restores a live source pane when the graph arrives under the per-leaf mirror after the lookup', async () => {
  const worktreeId = 'repo1::/dispatcher'
  const mirrorId = `web-terminal-${encodeURIComponent(`dispatcher-tab::${LEAF}`)}`
  selectLocalTaskDispatcherEndpoint('runtime:mini')
  useAppStore.setState({
    terminalLayoutsByTabId: {},
    unifiedTabsByWorktree: {},
    fetchProjectGroups: vi.fn(async () => {}),
    fetchFolderWorkspaces: vi.fn(async () => {}),
    runtimeStatusByEnvironmentId: new Map([
      [
        'mini',
        {
          checkedAt: 1,
          status: {
            runtimeId: 'mini-runtime',
            rendererGraphEpoch: 1,
            graphStatus: 'ready',
            authoritativeWindowId: 1,
            liveTabCount: 1,
            liveLeafCount: 1
          }
        }
      ]
    ]),
    repos: [{ ...TEST_REPO, executionHostId: 'runtime:mini' }],
    worktreesByRepo: {
      repo1: [makeWorktree({ id: worktreeId, repoId: 'repo1', hostId: 'runtime:mini' })]
    }
  })
  fixture.preferences.mockResolvedValue({
    'dispatcher.session.v1': JSON.stringify({ worktreeId, paneKey: PANE })
  })
  fixture.find.mockResolvedValue({ tabId: 'dispatcher-tab', leafId: LEAF, connected: true })
  fixture.activateOwner.mockImplementationOnce(() => {
    useAppStore.setState({
      terminalLayoutsByTabId: {
        [mirrorId]: {
          root: { type: 'leaf', leafId: LEAF },
          activeLeafId: LEAF,
          expandedLeafId: null,
          ptyIdsByLeafId: {}
        }
      },
      unifiedTabsByWorktree: {
        [worktreeId]: [
          { ...tab, id: mirrorId, entityId: mirrorId, worktreeId, executionHostId: 'runtime:mini' }
        ]
      }
    })
  })
  await expect(openLocalTaskDispatcher('claude')).resolves.toBe(true)
  expect(fixture.activateOwner).toHaveBeenCalledWith(
    worktreeId,
    'web-terminal-dispatcher-tab',
    LEAF,
    'mini'
  )
  expect(fixture.reveal).toHaveBeenLastCalledWith({
    worktreeId,
    tabId: mirrorId,
    leafId: LEAF,
    executionHostId: 'runtime:mini'
  })
  expect(fixture.launch).not.toHaveBeenCalled()
})

it('minimizes only the previous local dispatcher overlay when revealing the remote dispatcher', async () => {
  localTasksDomainStore.getState().openEndpoint('local')
  localTasksDomainStore.getState().writer('local').applyPreferences({ 'dispatcher.paneKey': PANE })
  const worktreeId = 'repo1::/dispatcher'
  selectLocalTaskDispatcherEndpoint('runtime:mini')
  localTaskDispatcherStore.setState({ paneKey: PANE, worktreeId })
  useAppStore.setState({
    floatingWorkspacePanelOpen: true,
    activeTabIdByWorktree: { [WORKTREE]: 'dispatcher-tab' },
    runtimeStatusByEnvironmentId: new Map([
      [
        'mini',
        {
          checkedAt: 1,
          status: {
            runtimeId: 'mini-runtime',
            rendererGraphEpoch: 1,
            graphStatus: 'ready',
            authoritativeWindowId: 1,
            liveTabCount: 1,
            liveLeafCount: 1
          }
        }
      ]
    ]),
    unifiedTabsByWorktree: {
      [worktreeId]: [{ ...tab, worktreeId, executionHostId: 'runtime:mini' }]
    }
  })
  await expect(openLocalTaskDispatcher('claude')).resolves.toBe(true)
  expect(fixture.panel).toHaveBeenCalledWith(false)
  expect(fixture.launch).not.toHaveBeenCalled()
  fixture.panel.mockClear()
  useAppStore.setState({ activeTabIdByWorktree: { [WORKTREE]: 'another-floating-session' } })
  await expect(openLocalTaskDispatcher('claude')).resolves.toBe(true)
  expect(fixture.panel).not.toHaveBeenCalled()
  localTasksDomainStore
    .getState()
    .writer('local')
    .applyPreferences({ 'dispatcher.paneKey': 'invalid-legacy-pane' })
  useAppStore.setState({ activeTabIdByWorktree: {} })
  await expect(openLocalTaskDispatcher('claude')).resolves.toBe(true)
  expect(fixture.panel).not.toHaveBeenCalled()
})
