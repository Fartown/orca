import { IssueRuntimeClient } from '@/issues/issue-runtime-client'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import type { WorkspaceScope } from '../../../../shared/folder-workspace-types'
import type { IssueRouteExecutionHostId } from '../../../../shared/issues/types'
import type { TuiAgent } from '../../../../shared/tui-agent'
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

export type IssueConversationLaunchOutcome = { status: 'launched' }

export async function prepareAndLaunchIssueConversation(
  input: IssueConversationLaunchInput
): Promise<IssueConversationLaunchOutcome> {
  const client = IssueRuntimeClient.forRoute(input.route)
  await client.mutate('conversations.prepareLaunch', {
    mutationId: input.mutationId,
    launchToken: input.launchToken,
    workspaceRef: input.workspace.ref,
    workspaceSnapshot: { name: input.workspace.label, path: input.workspace.path },
    agent: input.agent,
    issueId: input.issueId
  })
  const launchResult = launchAgentInNewTab({
    agent: input.agent,
    worktreeId: input.workspace.id,
    launchToken: input.launchToken
  })
  if (!launchResult) {
    throw new Error('The selected agent could not be launched.')
  }
  if (!(await revealIssueConversationWorkspace(input.workspace.id, input.route))) {
    throw new Error('The Conversation started, but its Workspace could not be opened.')
  }
  return { status: 'launched' }
}
