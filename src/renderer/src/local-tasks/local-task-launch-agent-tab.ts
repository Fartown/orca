import { parseRoutableExecutionHostId, type ExecutionHostId } from '../../../shared/execution-host'
import { toWebTerminalSurfaceTabId } from '../../../shared/terminal-surface-id'
import type { TuiAgent } from '../../../shared/tui-agent'

type WorktreeTabs = {
  tabsByWorktree: Readonly<Record<string, readonly { id: string; launchAgent?: TuiAgent }[]>>
}

/**
 * The tab a started task's agent runs in, by creation's own rule (`resolveLaunchAgentTabId` in
 * `worktree-creation-agent-seeds.ts`) but placed by the workspace's host, never the focused server:
 * only a paired server's tabs reach this client as `web-terminal-` mirrors. This app and an SSH
 * target it dials itself keep the startup tab's own id.
 */
export function localTaskLaunchAgentTabId(
  state: WorktreeTabs,
  args: {
    agent: TuiAgent
    worktreeId: string
    hostId: ExecutionHostId
    primaryTabId: string | null
    startupTerminalTabId: string | null | undefined
    backendSpawned: boolean
  }
): string | null {
  // Main spawned the agent itself, so its startup tab is authoritative.
  if (args.backendSpawned && args.startupTerminalTabId) {
    return parseRoutableExecutionHostId(args.hostId)?.kind === 'runtime'
      ? toWebTerminalSurfaceTabId(args.startupTerminalTabId)
      : args.startupTerminalTabId
  }
  const stamped = (state.tabsByWorktree[args.worktreeId] ?? []).find(
    (tab) => tab.launchAgent === args.agent
  )?.id
  // Why: when the renderer owns startup it queues the agent on primaryTabId.
  return stamped ?? args.primaryTabId ?? args.startupTerminalTabId ?? null
}
