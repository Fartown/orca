import type { WorkspaceScope } from '../../shared/folder-workspace-types'
import type {
  AuthorityExecutionHostId,
  DeleteIssuePlan,
  ExternalIssueSource,
  WorkspaceSnapshot
} from '../../shared/issues/types'
import type { TuiAgent } from '../../shared/tui-agent'

type RuntimeMutation = {
  authorityExecutionHostId: AuthorityExecutionHostId
  mutationId: string
}

export type CreateIssueRuntimeParams = RuntimeMutation & {
  source: { kind: 'local'; title: string } | ExternalIssueSource
  parentId?: string | null
  index?: number
  typeLabel?: string | null
  note?: string | null
}

export type UpdateIssueRuntimeParams = RuntimeMutation & {
  issueId: string
  expectedRecordRevision: number
  title?: string
  typeLabel?: string | null
  note?: string | null
}

export type IssueLifecycleRuntimeParams = RuntimeMutation & {
  issueId: string
  expectedRecordRevision: number
}

export type ReparentIssueRuntimeParams = RuntimeMutation & {
  issueId: string
  parentId: string | null
  index: number
  expectedTreeRevision: number
}

export type PrepareDeleteIssueRuntimeParams = {
  authorityExecutionHostId: AuthorityExecutionHostId
  issueId: string
}

export type DeleteIssueRuntimeParams = RuntimeMutation & { plan: DeleteIssuePlan }

export type UpdateConversationRuntimeParams = RuntimeMutation & {
  conversationId: string
  expectedRecordRevision: number
  title: string | null
}

export type BindConversationRuntimeParams = RuntimeMutation & {
  conversationId: string
  expectedRecordRevision: number
  issueId: string | null
}

export type PrepareLaunchRuntimeParams = RuntimeMutation & {
  launchToken: string
  workspaceRef: WorkspaceScope
  workspaceSnapshot: WorkspaceSnapshot
  agent: TuiAgent
  issueId: string | null
  title?: string | null
}

export type PrepareRetryRuntimeParams = RuntimeMutation & {
  launchToken: string
  conversationId: string
  expectedRecordRevision: number
}

export type RecordLaunchFailureRuntimeParams = RuntimeMutation & {
  conversationId: string
  claimId: string
  expectedRecordRevision: number
  failure: string
}

export type PrepareDeleteConversationRuntimeParams = {
  authorityExecutionHostId: AuthorityExecutionHostId
  conversationId: string
}

export type DeleteConversationRuntimeParams = RuntimeMutation & {
  conversationId: string
  expectedRecordRevision: number
  preflightToken: string
}

export type RoundMutationRuntimeParams = RuntimeMutation & { roundId: string }
