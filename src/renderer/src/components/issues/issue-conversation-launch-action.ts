import { IssueRuntimeClient } from '@/issues/issue-runtime-client'
import { launchAgentInNewTab, type LaunchAgentInNewTabArgs } from '@/lib/launch-agent-in-new-tab'
import type { WorkspaceScope } from '../../../../shared/folder-workspace-types'
import type {
  ConversationLaunchPreparation,
  IssueRouteExecutionHostId
} from '../../../../shared/issues/types'
import type { TuiAgent } from '../../../../shared/tui-agent'

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
  | { status: 'launcher-failed'; message: string }

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
  return launchPreparedIssueConversation(client, preparation, {
    agent: input.agent,
    worktreeId: input.workspace.id,
    launchToken: input.launchToken
  })
}

export async function launchPreparedIssueConversation(
  client: Pick<IssueRuntimeClient, 'mutate'>,
  preparation: ConversationLaunchPreparation,
  launchArgs: LaunchAgentInNewTabArgs
): Promise<IssueConversationLaunchOutcome> {
  let failure: string | null = null
  try {
    if (!launchAgentInNewTab(launchArgs)) {
      failure = 'The selected agent could not be launched.'
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }
  if (!failure) {
    return { status: 'launched' }
  }
  await client.mutate('conversations.recordLaunchFailure', {
    mutationId: crypto.randomUUID(),
    conversationId: preparation.conversation.id,
    claimId: preparation.claimId,
    expectedRecordRevision: preparation.conversation.recordRevision,
    failure
  })
  return { status: 'launcher-failed', message: failure }
}
