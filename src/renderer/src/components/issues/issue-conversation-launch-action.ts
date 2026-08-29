import { IssueRuntimeClient } from '@/issues/issue-runtime-client'
import { launchAgentInNewTab, type LaunchAgentInNewTabArgs } from '@/lib/launch-agent-in-new-tab'
import { toast } from 'sonner'
import type { WorkspaceScope } from '../../../../shared/folder-workspace-types'
import type {
  ConversationLaunchPreparation,
  ConversationSummary,
  IssueRouteExecutionHostId
} from '../../../../shared/issues/types'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { folderWorkspaceKey } from '../../../../shared/workspace-scope'
import { recordPreparedIssueConversationLaunchFailure } from '@/issues/issue-conversation-launch-failure'
import { observePreparedIssueConversationLocalLaunch } from '@/issues/issue-conversation-launch-observer'
import { revealIssueConversationWorkspace } from '@/issues/issue-conversation-navigation'

export type IssueConversationLaunchInput = {
  route: IssueRouteExecutionHostId
  issueId: string
  workspace: {
    id: string
    label: string
    path: string
    ref: WorkspaceScope
  }
  agent: TuiAgent
  launchToken: string
  mutationId: string
}

export type IssueConversationLaunchOutcome =
  | { status: 'launched' }
  | { status: 'launcher-failed'; message: string; failureNotified: boolean }

const pendingRetries = new Map<string, Promise<boolean>>()

export async function prepareAndLaunchIssueConversation(
  input: IssueConversationLaunchInput
): Promise<IssueConversationLaunchOutcome> {
  const client = IssueRuntimeClient.forRoute(input.route)
  const preparation = await client.mutate<ConversationLaunchPreparation>(
    'conversations.prepareLaunch',
    {
      mutationId: input.mutationId,
      launchToken: input.launchToken,
      workspaceRef: input.workspace.ref,
      workspaceSnapshot: { name: input.workspace.label, path: input.workspace.path },
      agent: input.agent,
      issueId: input.issueId
    }
  )
  return launchPreparedIssueConversation(client, preparation, input.route, {
    agent: input.agent,
    worktreeId: input.workspace.id,
    launchToken: input.launchToken
  })
}

export function retryIssueConversation(
  route: IssueRouteExecutionHostId,
  conversation: ConversationSummary,
  onChanged?: () => void
): Promise<boolean> {
  const key = `${route}\0${conversation.id}`
  const pending = pendingRetries.get(key)
  if (pending) {
    return pending
  }
  const retry = performRetryIssueConversation(route, conversation, onChanged).finally(() => {
    if (pendingRetries.get(key) === retry) {
      pendingRetries.delete(key)
    }
  })
  pendingRetries.set(key, retry)
  return retry
}

async function performRetryIssueConversation(
  route: IssueRouteExecutionHostId,
  conversation: ConversationSummary,
  onChanged?: () => void
): Promise<boolean> {
  const launchToken = crypto.randomUUID()
  try {
    const client = IssueRuntimeClient.forRoute(route)
    const preparation = await client.mutate<ConversationLaunchPreparation>(
      'conversations.prepareRetry',
      {
        mutationId: crypto.randomUUID(),
        conversationId: conversation.id,
        expectedRecordRevision: conversation.recordRevision,
        launchToken
      }
    )
    const outcome = await launchPreparedIssueConversation(client, preparation, route, {
      agent: conversation.agent,
      worktreeId:
        conversation.workspaceRef.type === 'worktree'
          ? conversation.workspaceRef.worktreeId
          : folderWorkspaceKey(conversation.workspaceRef.folderWorkspaceId),
      launchToken
    })
    onChanged?.()
    if (outcome.status === 'launcher-failed' && !outcome.failureNotified) {
      toast.error(outcome.message)
    }
    return outcome.status === 'launched'
  } catch (error) {
    onChanged?.()
    toast.error(error instanceof Error ? error.message : String(error))
    return false
  }
}

export async function launchPreparedIssueConversation(
  client: Pick<IssueRuntimeClient, 'mutate'>,
  preparation: ConversationLaunchPreparation,
  route: IssueRouteExecutionHostId,
  launchArgs: LaunchAgentInNewTabArgs
): Promise<IssueConversationLaunchOutcome> {
  let failure: string | null = null
  let failureNotified = false
  try {
    const launchResult = launchAgentInNewTab(launchArgs)
    if (!launchResult) {
      failure = 'The selected agent could not be launched.'
    } else if (launchResult.runtimeLaunchResult) {
      const runtimeResult = await launchResult.runtimeLaunchResult
      if (!runtimeResult.launched) {
        failure = runtimeResult.message?.trim() || 'The selected agent could not be launched.'
        failureNotified = runtimeResult.failureNotified
      }
    } else if (launchResult.tabId) {
      observePreparedIssueConversationLocalLaunch(client, preparation, route, {
        worktreeId: launchArgs.worktreeId,
        tabId: launchResult.tabId
      })
    }
  } catch (error) {
    failure = launchFailureMessage(error)
  }
  if (!failure) {
    await revealIssueConversationWorkspace(launchArgs.worktreeId, route)
    return { status: 'launched' }
  }
  await recordPreparedIssueConversationLaunchFailure(client, preparation, failure)
  return { status: 'launcher-failed', message: failure, failureNotified }
}

function launchFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.trim() : String(error).trim()
  return message || 'The selected agent could not be launched.'
}
