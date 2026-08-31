import { toast } from 'sonner'
import { jumpToAiVaultOriginalPane } from '@/components/right-sidebar/ai-vault-original-pane-actions'
import { resolveAiVaultSessionByProviderIdentity } from '@/components/right-sidebar/ai-vault-provider-session-resolution'
import { resumeAiVaultSession } from '@/components/right-sidebar/ai-vault-session-launch-actions'
import { issueDomainStore } from '@/issues/issues-domain-store'
import { useAppStore } from '@/store'
import type { ConversationSummary, IssueRouteExecutionHostId } from '../../../shared/issues/types'
import { folderWorkspaceKey } from '../../../shared/workspace-scope'

export async function resumeIssueConversationWithAiVault(
  route: IssueRouteExecutionHostId,
  conversation: ConversationSummary
): Promise<boolean> {
  const providerSession = conversation.navigation?.providerSession
  if (!providerSession) {
    toast.error('This Conversation cannot be resumed.')
    return false
  }

  const session = await resolveAiVaultSessionByProviderIdentity({
    executionHostId: route,
    agent: conversation.agent,
    providerSession,
    workspacePaths: [conversation.workspaceSnapshot.path]
  })
  if (!session) {
    return false
  }

  const jumpResult = jumpToAiVaultOriginalPane(session, { notifyWhenMissing: false })
  if (jumpResult === 'focused') {
    issueDomainStore.getState().setActiveIssueRoute(null)
    return true
  }
  if (jumpResult === 'workspace-unavailable') {
    return false
  }

  const state = useAppStore.getState()
  const resumed = await resumeAiVaultSession({
    session,
    activeWorktreeId: state.activeWorktreeId,
    targetWorktreeId: conversationWorkspaceKey(conversation),
    targetState: state,
    agentCmdOverrides: state.settings?.agentCmdOverrides
  })
  if (resumed) {
    issueDomainStore.getState().setActiveIssueRoute(null)
  }
  return resumed
}

function conversationWorkspaceKey(conversation: ConversationSummary): string {
  return conversation.workspaceRef.type === 'worktree'
    ? conversation.workspaceRef.worktreeId
    : folderWorkspaceKey(conversation.workspaceRef.folderWorkspaceId)
}
