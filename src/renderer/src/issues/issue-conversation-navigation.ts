import { activateWorktreeFromSidebar } from '@/lib/sidebar-worktree-activation'
import { issueDomainStore } from '@/issues/issues-domain-store'
import { resumeIssueConversationWithAiVault } from '@/issues/issue-conversation-resume'
import type { ConversationSummary, IssueRouteExecutionHostId } from '../../../shared/issues/types'
import { folderWorkspaceKey } from '../../../shared/workspace-scope'

export type IssueConversationNavigationOutcome =
  | 'opened-issue'
  | 'opened-workspace'
  | 'resumed'
  | 'resume-failed'
  | 'workspace-unavailable'

export async function revealIssueConversationWorkspace(
  workspaceKey: string,
  route: IssueRouteExecutionHostId
): Promise<boolean> {
  const activated = await activateWorktreeFromSidebar(workspaceKey, route)
  if (!activated) {
    return false
  }
  issueDomainStore.getState().setActiveIssueRoute(null)
  return true
}

export async function activateMissingWorkspaceIssueConversation(
  conversation: ConversationSummary,
  route: IssueRouteExecutionHostId
): Promise<IssueConversationNavigationOutcome> {
  if (conversation.navigation?.providerSession) {
    return (await resumeIssueConversationWithAiVault(route, conversation))
      ? 'resumed'
      : 'resume-failed'
  }

  if (conversation.issueId) {
    issueDomainStore.getState().setActiveIssueRoute({
      routeExecutionHostId: route,
      issueId: conversation.issueId
    })
    return 'opened-issue'
  }
  return (await revealIssueConversationWorkspace(conversationWorkspaceKey(conversation), route))
    ? 'opened-workspace'
    : 'workspace-unavailable'
}

function conversationWorkspaceKey(conversation: ConversationSummary): string {
  return conversation.workspaceRef.type === 'worktree'
    ? conversation.workspaceRef.worktreeId
    : folderWorkspaceKey(conversation.workspaceRef.folderWorkspaceId)
}
