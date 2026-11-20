// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

const bind = vi.hoisted(() => vi.fn(() => vi.fn()))
const upkeep = vi.hoisted(() => {
  const fixes: { input: { taskId: string }; repoId: string | null }[] = []
  const library = (workspaces: unknown[]) => [
    {
      endpoint: 'local',
      linksLoaded: true,
      links: { workspaces, sessions: [] },
      tasks: [],
      projects: []
    }
  ]
  return {
    library,
    partitions: library([]),
    fixes,
    appInputReads: 0,
    appListeners: new Set<() => void>(),
    resolveWorkspace:
      vi.fn<(input: { taskId: string }, repoId: string | null) => Promise<unknown>>()
  }
})
const state = {
  workspaceSessionReady: false,
  settings: {},
  agentStatusByPaneKey: {},
  unifiedTabsByWorktree: {},
  tabsByWorktree: {},
  detectedWorktreesByRepo: {},
  folderWorkspaces: {},
  repos: {},
  sshConnectionStates: {},
  prCache: {},
  hostedReviewCache: {}
}
type MockAppState = typeof state
vi.mock('@/store', () => ({
  useAppStore: Object.assign((select: (state: MockAppState) => unknown) => select(state), {
    getState: () => state,
    subscribe: (listener: () => void) => {
      upkeep.appListeners.add(listener)
      return () => upkeep.appListeners.delete(listener)
    }
  })
}))
vi.mock('../store/workspaces/catalog/workspace-record-fields', () => ({
  selectWorktreesByRepo: () => {
    upkeep.appInputReads += 1
    return []
  },
  selectDetectedWorktreesByRepo: (app: MockAppState) => app.detectedWorktreesByRepo,
  selectFolderWorkspaces: (app: MockAppState) => app.folderWorkspaces
}))
vi.mock('../hooks/ipc-events/runtime-events/runtime-environment-subscription-selection', () => ({
  getReachableRuntimeEnvironmentIds: () => []
}))
vi.mock('./local-task-start-work', () => ({ bindLocalTaskStartWork: bind }))
vi.mock('./local-task-seen-forwarding', () => ({ bindLocalTaskSeenForwarding: () => () => {} }))
vi.mock('./local-task-link-maintenance', () => ({
  findLocalTaskPrMergedTriggers: () => [],
  findLocalTaskWorkspaceFixes: () => upkeep.fixes,
  selectLocalTaskReviewWorktreeIds: () => []
}))
vi.mock('./local-tasks-domain-store', () => ({
  localTasksDomainStore: {
    subscribe: () => vi.fn(),
    getState: () => ({ partitions: upkeep.partitions })
  },
  isLocalTasksWritable: () => true
}))
vi.mock('./local-tasks-runtime-client', () => ({
  localTasksClient: { resolveWorkspace: upkeep.resolveWorkspace }
}))
vi.mock('../app-shell/platform/web-client-location', () => ({ isWebClientLocation: () => false }))
vi.mock('../app-shell/ActiveWorkspaceSyncGate', () => ({ ActiveWorkspaceSyncGate: () => null }))
vi.mock('../lib/agent-session/hibernation/AgentHibernationGate', () => ({
  AgentHibernationGate: () => null
}))
vi.mock('../lib/agent-session/history/title-sync/AiVaultTabTitleSyncGate', () => ({
  AiVaultTabTitleSyncGate: () => null
}))
vi.mock('../components/ports/WorkspacePortScanner', () => ({ WorkspacePortScanner: () => null }))
vi.mock('../components/sidebar/worktree-list/listing/SavedHostScopeWidenGate', () => ({
  SavedHostScopeWidenGate: () => null
}))
vi.mock('../hooks/MacosTccPromptNoticeHost', () => ({ MacosTccPromptNoticeHost: () => null }))
vi.mock(
  '../components/browser-pane/remote-host-control/RemoteHostBrowserControlNoticeHost',
  () => ({ RemoteHostBrowserControlNoticeHost: () => null })
)
vi.mock('../lib/agent-session/history/session-names/TerminalSessionNameSyncGate', () => ({
  TerminalSessionNameSyncGate: () => null
}))
vi.mock('../components/native-chat/media/visuals/NativeChatVisualGuestThemePublisher', () => ({
  NativeChatVisualGuestThemePublisher: () => null
}))
vi.mock('../components/mobile/paired-mobile-devices', () => ({
  usePairedMobileDevices: () => ({ hasPairedDevice: false })
}))
vi.mock('../goals/GoalDomainSyncGate', () => ({ GoalDomainSyncGate: () => null }))
vi.mock('./LocalTasksSyncGate', () => ({ LocalTasksSyncGate: () => null }))
vi.mock(
  '../components/native-chat/session/attention/StructuredAgentSessionAttentionBridge',
  () => ({
    StructuredAgentSessionAttentionBridge: () => null
  })
)
vi.mock('../components/native-chat/session/status/StructuredAgentSessionStatusBridge', () => ({
  StructuredAgentSessionStatusBridge: () => null
}))

import { AppBackgroundServices } from '../app-shell/AppBackgroundServices'

// The background tree reads preload capabilities; this window exposes none.
Object.defineProperty(window, 'api', { value: {}, configurable: true })

function publishAppChange(): void {
  for (const listener of upkeep.appListeners) {
    listener()
  }
}

afterEach(() => {
  cleanup()
  upkeep.partitions = upkeep.library([])
  upkeep.fixes = []
  upkeep.appInputReads = 0
  upkeep.resolveWorkspace.mockReset()
  bind.mockReset()
  bind.mockImplementation(() => vi.fn())
})

it('mounts task link maintenance from the real background service tree', () => {
  const { unmount } = render(<AppBackgroundServices />)
  expect(bind).toHaveBeenCalledOnce()
  unmount()
})

it('retries a transient link RPC failure on a later visibility event', async () => {
  upkeep.fixes = [{ input: { taskId: 'task-1' }, repoId: null }]
  upkeep.resolveWorkspace.mockRejectedValueOnce(new Error('host temporarily unavailable'))
  upkeep.resolveWorkspace.mockResolvedValueOnce({ ok: true })
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { unmount } = render(<AppBackgroundServices />)
  await vi.waitFor(() => expect(upkeep.resolveWorkspace).toHaveBeenCalledTimes(1))
  await vi.waitFor(() => expect(consoleError).toHaveBeenCalledOnce())
  document.dispatchEvent(new Event('visibilitychange'))
  await vi.waitFor(() => expect(upkeep.resolveWorkspace).toHaveBeenCalledTimes(2))
  unmount()
  consoleError.mockRestore()
})

it('gathers nothing from the app store on its changes while no workspace is linked', () => {
  const { unmount } = render(<AppBackgroundServices />)
  const afterMount = upkeep.appInputReads
  publishAppChange()
  publishAppChange()
  expect(upkeep.appInputReads).toBe(afterMount)
  unmount()

  upkeep.partitions = upkeep.library([{ kind: 'git-worktree', taskId: 'task-1' }])
  const linked = render(<AppBackgroundServices />)
  const linkedAfterMount = upkeep.appInputReads
  publishAppChange()
  expect(upkeep.appInputReads).toBe(linkedAfterMount + 1)
  linked.unmount()
})

it('keeps the window up when link upkeep itself throws', () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  bind.mockImplementation(() => {
    throw new Error('start-work binding failed')
  })
  render(
    <>
      <AppBackgroundServices />
      <p>workspace</p>
    </>
  )
  act(() => {})
  expect(screen.getByText('workspace')).toBeTruthy()
  consoleError.mockRestore()
})
