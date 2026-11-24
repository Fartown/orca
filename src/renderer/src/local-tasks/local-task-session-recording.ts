import type { AppState } from '@/store/types'
import { findStructuredAgentSessionTab } from '@/lib/agent-session/structured-agent-session-tab-activation'
import type { ExecutionHostId } from '../../../shared/execution-host/execution-host'
import { structuredAgentSessionPaneKey } from '../../../shared/agent-session/view/structured-agent-session-projection'
import type { Tab } from '../../../shared/workspace-layout/tab-groups/tab-types'
import type { TuiAgent } from '../../../shared/agent-launch/catalog/tui-agent'
import type { LocalTasksLinksRecordSessionInput } from '../../../shared/local-tasks/local-tasks-link-rpc-params'
import type {
  LocalTaskLinkOrigin,
  LocalTaskSessionLink
} from '../../../shared/local-tasks/local-task-link-types'
import { localTasksClient } from './local-tasks-runtime-client'
import { runLocalTaskWrite } from './local-task-writes'
import { crossHostLocalTaskSessionInput } from './local-task-cross-host-session-link'

export type LocalTaskSessionTarget = {
  taskId: string
  hostId: ExecutionHostId
  worktreeId: string
  instanceId: string | null
  /** Null when an existing session is linked and its agent never reported. */
  agent: TuiAgent | null
  linkedVia: LocalTaskLinkOrigin
  crossHost?: boolean
  replacingSessionLinkId?: string
}

type SessionIds = Pick<
  LocalTasksLinksRecordSessionInput,
  'surface' | 'tabId' | 'paneKey' | 'sessionId'
>

export async function recordLocalTaskSession(
  target: LocalTaskSessionTarget,
  ids: SessionIds
): Promise<boolean> {
  return (await recordLocalTaskSessionLink(target, ids)) !== null
}

export async function recordLocalTaskSessionLink(
  target: LocalTaskSessionTarget,
  ids: SessionIds
): Promise<LocalTaskSessionLink | null> {
  const result = await runLocalTaskWrite(() => {
    const input = {
      taskId: target.taskId,
      hostId: target.hostId,
      worktreeId: target.worktreeId,
      ...(target.instanceId ? { instanceId: target.instanceId } : {}),
      ...(target.agent ? { agent: target.agent } : {}),
      linkedVia: target.linkedVia,
      ...(target.replacingSessionLinkId
        ? { replacingSessionLinkId: target.replacingSessionLinkId }
        : {}),
      ...ids
    }
    return localTasksClient.recordSession(
      target.crossHost ? crossHostLocalTaskSessionInput(input) : input
    )
  })
  return result?.session ?? null
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
