import { expect, it } from 'vitest'
import type { ExecutionHostId } from '../../../shared/execution-host'
import { localTaskLaunchAgentTabId } from './local-task-launch-agent-tab'

const WORKTREE_ID = 'repo1::/repo1/shop-12'

function rendererStartedTab(
  hostId: ExecutionHostId,
  tabs: { id: string; launchAgent?: 'claude' }[],
  primaryTabId: string | null
): string | null {
  return localTaskLaunchAgentTabId(
    { tabsByWorktree: { [WORKTREE_ID]: tabs } },
    {
      agent: 'claude',
      worktreeId: WORKTREE_ID,
      hostId,
      primaryTabId,
      startupTerminalTabId: 'host-agent-tab',
      backendSpawned: false
    }
  )
}

it.each(['local', 'ssh:minizc', 'runtime:env-1'] as const)(
  'keeps creation’s order on %s when the renderer starts the agent: stamped, primary, startup',
  (hostId) => {
    const stamped = [{ id: 'dev-server' }, { id: 'agent', launchAgent: 'claude' as const }]
    expect(rendererStartedTab(hostId, stamped, 'dev-server')).toBe('agent')
    expect(rendererStartedTab(hostId, [{ id: 'dev-server' }], 'dev-server')).toBe('dev-server')
    expect(rendererStartedTab(hostId, [], null)).toBe('host-agent-tab')
  }
)
