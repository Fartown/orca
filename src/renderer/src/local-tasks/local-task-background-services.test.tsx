// @vitest-environment happy-dom
import { render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

const bind = vi.hoisted(() => vi.fn(() => vi.fn()))
const upkeep = vi.hoisted(() => {
  const fixes: { input: { taskId: string }; repoId: string | null }[] = []
  return {
    linksLoaded: false,
    fixes,
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
    subscribe: () => vi.fn()
  })
}))
vi.mock('../store/workspace-record-selectors', () => ({ selectWorktreesByRepo: () => [] }))
vi.mock('../hooks/ipc-events/runtime-environment-subscription-selection', () => ({
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
    getState: () => ({
      partitions: [
        { endpoint: 'local', linksLoaded: upkeep.linksLoaded, links: {}, tasks: [], projects: [] }
      ]
    })
  },
  isLocalTasksWritable: () => true
}))
vi.mock('./local-tasks-runtime-client', () => ({
  localTasksClient: { resolveWorkspace: upkeep.resolveWorkspace }
}))
vi.mock('../lib/web-client-location', () => ({ isWebClientLocation: () => false }))
vi.mock('../components/AgentHibernationGate', () => ({ AgentHibernationGate: () => null }))
vi.mock('../components/AiVaultTabTitleSyncGate', () => ({ AiVaultTabTitleSyncGate: () => null }))
vi.mock('../components/dashboard/RetainedAgentsSyncGate', () => ({ default: () => null }))
vi.mock('../components/ports/WorkspacePortScanner', () => ({ WorkspacePortScanner: () => null }))
vi.mock('../components/sidebar/SavedHostScopeWidenGate', () => ({
  SavedHostScopeWidenGate: () => null
}))
vi.mock('../hooks/MacosTccPromptNoticeHost', () => ({ MacosTccPromptNoticeHost: () => null }))
vi.mock('../goals/GoalDomainSyncGate', () => ({ GoalDomainSyncGate: () => null }))
vi.mock('./LocalTasksSyncGate', () => ({ LocalTasksSyncGate: () => null }))
vi.mock('../components/native-chat/StructuredAgentSessionAttentionBridge', () => ({
  StructuredAgentSessionAttentionBridge: () => null
}))
vi.mock('../components/native-chat/StructuredAgentSessionStatusBridge', () => ({
  StructuredAgentSessionStatusBridge: () => null
}))

import { AppBackgroundServices } from '../app-shell/AppBackgroundServices'

afterEach(() => {
  upkeep.linksLoaded = false
  upkeep.fixes = []
  upkeep.resolveWorkspace.mockReset()
  bind.mockClear()
})

it('mounts task link maintenance from the real background service tree', () => {
  const { unmount } = render(<AppBackgroundServices />)
  expect(bind).toHaveBeenCalledOnce()
  unmount()
})

it('retries a transient link RPC failure on a later visibility event', async () => {
  upkeep.linksLoaded = true
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
