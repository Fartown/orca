import { toast } from 'sonner'
import { resolveAiVaultSessionByProviderIdentity } from '@/components/right-sidebar/ai-vault-provider-session-resolution'
import { jumpToAiVaultOriginalPane } from '@/components/right-sidebar/ai-vault-original-pane-actions'
import { resumeAiVaultSession } from '@/components/right-sidebar/ai-vault-session-launch-actions'
import { resolveAiVaultTargetWorkspacePath } from '@/components/right-sidebar/ai-vault-session-launch-target'
import { issueDomainStore } from '@/issues/issues-domain-store'
import { useAppStore } from '@/store'
import type { ConversationSummary, IssueRouteExecutionHostId } from '../../../shared/issues/types'
import { folderWorkspaceKey } from '../../../shared/workspace-scope'
import { toIssueConversationAiVaultSessionReference } from './issue-conversation-ai-vault-session'
import { focusPendingIssueConversationTab } from './issue-conversation-pending-tab'

const pendingResumes = new Map<string, Promise<boolean>>()
const pendingResumeListeners = new Set<() => void>()

export function subscribeIssueConversationResumePending(listener: () => void): () => void {
  pendingResumeListeners.add(listener)
  return () => pendingResumeListeners.delete(listener)
}

export function isIssueConversationResumePending(
  route: IssueRouteExecutionHostId,
  conversationId: string
): boolean {
  return pendingResumes.has(pendingResumeKey(route, conversationId))
}

export function resumeIssueConversationWithAiVault(
  route: IssueRouteExecutionHostId,
  conversation: ConversationSummary
): Promise<boolean> {
  const key = pendingResumeKey(route, conversation.id)
  const pending = pendingResumes.get(key)
  if (pending) {
    return pending
  }
  const resume = Promise.resolve()
    .then(() => performResume(route, conversation))
    .finally(() => {
      if (pendingResumes.get(key) === resume) {
        pendingResumes.delete(key)
        notifyPendingResumeListeners()
      }
    })
  pendingResumes.set(key, resume)
  notifyPendingResumeListeners()
  return resume
}

function pendingResumeKey(route: IssueRouteExecutionHostId, conversationId: string): string {
  return `${route}\0${conversationId}`
}

function notifyPendingResumeListeners(): void {
  for (const listener of pendingResumeListeners) {
    listener()
  }
}

async function performResume(
  route: IssueRouteExecutionHostId,
  conversation: ConversationSummary
): Promise<boolean> {
  const providerSession = conversation.navigation?.providerSession
  const sessionReference = toIssueConversationAiVaultSessionReference(conversation, route)
  if (!providerSession || !sessionReference) {
    toast.error('This Conversation cannot be resumed.')
    return false
  }
  const existingJump = jumpToAiVaultOriginalPane(sessionReference, { notifyWhenMissing: false })
  if (existingJump !== 'missing') {
    if (existingJump === 'focused') {
      issueDomainStore.getState().setActiveIssueRoute(null)
      return true
    }
    return false
  }
  const pendingOutcome = await focusPendingIssueConversationTab(conversation.id, route)
  if (pendingOutcome) {
    return pendingOutcome === 'focused-pane'
  }
  try {
    const workspaceKey =
      conversation.workspaceRef.type === 'worktree'
        ? conversation.workspaceRef.worktreeId
        : folderWorkspaceKey(conversation.workspaceRef.folderWorkspaceId)
    const stateBeforeScan = useAppStore.getState()
    const currentWorkspacePath = resolveAiVaultTargetWorkspacePath(stateBeforeScan, workspaceKey)
    const resumedSession = await resolveAiVaultSessionByProviderIdentity({
      executionHostId: route,
      agent: conversation.agent,
      providerSession,
      workspacePaths: [
        ...new Set(
          [currentWorkspacePath, conversation.workspaceSnapshot.path].filter(
            (path): path is string => Boolean(path)
          )
        )
      ]
    })
    if (!resumedSession) {
      return false
    }
    const racedJump = jumpToAiVaultOriginalPane(sessionReference, { notifyWhenMissing: false })
    if (racedJump !== 'missing') {
      if (racedJump === 'focused') {
        issueDomainStore.getState().setActiveIssueRoute(null)
        return true
      }
      return false
    }
    const state = useAppStore.getState()
    const launchResult = await resumeAiVaultSession({
      session: resumedSession,
      activeWorktreeId: state.activeWorktreeId,
      targetWorktreeId: workspaceKey,
      targetState: state,
      agentCmdOverrides: state.settings?.agentCmdOverrides
    })
    if (!launchResult.launched) {
      return false
    }
    // The shared launch-gap locator hands later clicks to the original-pane index once hooks attach.
    issueDomainStore.getState().setActiveIssueRoute(null)
    return true
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
    return false
  }
}
