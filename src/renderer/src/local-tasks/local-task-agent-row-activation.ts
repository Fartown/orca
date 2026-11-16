import { useAppStore } from '@/store'
import { getKnownExecutionHostIdForWorktree } from '@/lib/worktree-runtime-owner'
import { parseExecutionHostId } from '../../../shared/execution-host'
import { parsePaneKey } from '../../../shared/stable-pane-id'
import { localTasksDomainStore } from './local-tasks-domain-store'
import { localTaskSessionPanelStore } from './local-task-session-panel-store'
import { openLocalTaskPage } from './local-task-navigation'

/** A sidebar agent row names one live pane. Only a link on that exact host and pane may replace it. */
export function openLocalTaskSessionFromAgentRow(
  worktreeId: string,
  tabId: string,
  paneKey: string
): boolean {
  const pane = parsePaneKey(paneKey)
  if (!pane || pane.tabId !== tabId) {
    return false
  }
  const hostId = getKnownExecutionHostIdForWorktree(useAppStore.getState(), worktreeId)
  if (!hostId) {
    return false
  }
  const links = localTasksDomainStore
    .getState()
    .links.sessions.filter(
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
