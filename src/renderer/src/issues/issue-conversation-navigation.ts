import { activateWorktreeFromSidebar } from '@/lib/sidebar-worktree-activation'
import { issueDomainStore } from '@/issues/issues-domain-store'
import { canResumeIssueConversation } from '@/issues/issue-conversation-presentation'
import { resumeIssueConversationWithAiVault } from '@/issues/issue-conversation-resume'
import { toIssueConversationAiVaultSessionReference } from '@/issues/issue-conversation-ai-vault-session'
import { jumpToAiVaultOriginalPane } from '@/components/right-sidebar/ai-vault-original-pane-actions'
import type { ConversationSummary, IssueRouteExecutionHostId } from '../../../shared/issues/types'
import { folderWorkspaceKey } from '../../../shared/workspace-scope'
import { focusPendingIssueConversationTab } from './issue-conversation-pending-tab'
export { registerPendingIssueConversationTab } from './issue-conversation-pending-tab'

export type IssueConversationNavigationOutcome =
  | 'focused-pane'
  | 'opened-issue'
  | 'opened-workspace'
  | 'resumed'
  | 'resume-failed'
  | 'original-pane-unavailable'
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
  route: IssueRouteExecutionHostId,
  onChanged?: () => void
): Promise<IssueConversationNavigationOutcome> {
  const sessionReference = toIssueConversationAiVaultSessionReference(conversation, route)
  if (sessionReference) {
    const jumpResult = jumpToAiVaultOriginalPane(sessionReference, { notifyWhenMissing: false })
    if (jumpResult === 'focused') {
      issueDomainStore.getState().setActiveIssueRoute(null)
      return 'focused-pane'
    }
    if (jumpResult === 'workspace-unavailable') {
      return 'original-pane-unavailable'
    }
  }
  const pendingOutcome = await focusPendingIssueConversationTab(conversation.id, route)
  if (pendingOutcome) {
    return pendingOutcome
  }
  if (canResumeIssueConversation(conversation)) {
    const resumed = await resumeIssueConversationWithAiVault(route, conversation)
    onChanged?.()
    return resumed ? 'resumed' : 'resume-failed'
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
