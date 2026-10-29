import type { AppState } from '@/store/types'
import { findStructuredAgentSessionTab } from '@/lib/structured-agent-session-tab-activation'
import type { ExecutionHostId } from '../../../shared/execution-host'
import { structuredAgentSessionPaneKey } from '../../../shared/structured-agent-session-projection'
import type { Tab } from '../../../shared/tab-types'
import type { TuiAgent } from '../../../shared/tui-agent'
import type { LocalTasksLinksRecordSessionInput } from '../../../shared/local-tasks/local-tasks-link-rpc-params'
import type { LocalTaskLinkOrigin } from '../../../shared/local-tasks/local-task-link-types'
import { localTasksClient } from './local-tasks-runtime-client'
import { runLocalTaskWrite } from './local-task-writes'

export type LocalTaskSessionTarget = {
  taskId: string
  hostId: ExecutionHostId
  worktreeId: string
  instanceId: string | null
  /** Null when an existing session is linked and its agent never reported. */
  agent: TuiAgent | null
  linkedVia: LocalTaskLinkOrigin
}

type SessionIds = Pick<
  LocalTasksLinksRecordSessionInput,
  'surface' | 'tabId' | 'paneKey' | 'sessionId'
>

export async function recordLocalTaskSession(
  target: LocalTaskSessionTarget,
  ids: SessionIds
): Promise<boolean> {
  const result = await runLocalTaskWrite(() =>
    localTasksClient.recordSession({
      taskId: target.taskId,
      hostId: target.hostId,
      worktreeId: target.worktreeId,
      ...(target.instanceId ? { instanceId: target.instanceId } : {}),
      ...(target.agent ? { agent: target.agent } : {}),
      linkedVia: target.linkedVia,
      ...ids
    })
  )
  return result !== null
}

/** A terminal by this client's tab id; the client turns a paired server's mirror back into its own. */
export function terminalSessionIds(tabId: string): SessionIds {
  return { surface: 'terminal', tabId }
}

export function chatSessionIds(tabId: string | null, sessionId: string): SessionIds {
  return tabId
    ? {
        surface: 'chat',
        tabId,
        sessionId,
        paneKey: structuredAgentSessionPaneKey(tabId, sessionId)
      }
    : { surface: 'chat', sessionId }
}

export function findChatTabForSession(
  state: AppState,
  worktreeId: string,
  sessionId: string
): Tab | null {
  return findStructuredAgentSessionTab(state.unifiedTabsByWorktree, {
    workspaceId: worktreeId,
    sessionId
  })
}
