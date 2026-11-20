import { useAppStore } from '@/store'
import { getKnownExecutionHostIdForWorktree } from '@/lib/workspace/ownership/worktree-runtime-owner'
import { parseExecutionHostId } from '../../../shared/execution-host/execution-host'
import { parsePaneKey } from '../../../shared/workspace-layout/stable-pane-id'
import { localTasksDomainStore } from './local-tasks-domain-store'
import { localTaskSessionPanelStore } from './local-task-session-panel-store'
import { openLocalTaskPage } from './local-task-navigation'
import { selectLocalTaskSidebarMode } from './local-task-sidebar-mode'

/** Only task mode may replace a sidebar pane activation with its exact linked task. */
export function openLocalTaskSessionFromAgentRow(
  worktreeId: string,
  tabId: string,
  paneKey: string
): boolean {
  const domain = localTasksDomainStore.getState()
  if (!selectLocalTaskSidebarMode(domain)) {
    const panel = localTaskSessionPanelStore.getState()
    if (panel.mode !== 'closed') {
      panel.close()
    }
    return false
  }
  const pane = parsePaneKey(paneKey)
  if (!pane || pane.tabId !== tabId) {
    return false
  }
  const hostId = getKnownExecutionHostIdForWorktree(useAppStore.getState(), worktreeId)
  if (!hostId) {
    return false
  }
  const links = domain.links.sessions.filter(
    (session) =>
      session.worktreeId === worktreeId && parseExecutionHostId(session.hostId)?.id === hostId
  )
  const exact = links.filter((session) => session.paneKey === paneKey)
  const candidates = exact.length
    ? exact
    : links.filter((session) => session.paneKey === null && session.tabId === tabId)
  if (candidates.length !== 1) {
    return false
  }
  const session = candidates[0]
  openLocalTaskPage({ taskId: session.taskId })
  localTaskSessionPanelStore.getState().open(session, 'wide')
  return true
}
