import type { WorkspaceScope } from '../../shared/folder-workspace-types'
import type {
  AuthorityExecutionHostId,
  ConversationTitleSource,
  DeleteIssuePlan,
  ExternalIssueProvider,
  IssueMutationIdentity,
  IssueRecord,
  RoundRecord,
  RoundRecordRef,
  RoundRecordStateSource,
  RoundResolution,
  RoundTextCompleteness,
  RoundWaitingReason,
  WorkspaceSnapshot
} from '../../shared/issues/types'
import type { TuiAgent } from '../../shared/tui-agent'

export type IssueMutationParams<Input> = {
  identity: IssueMutationIdentity
  input: Input
}

export type CreateLocalIssueInput = {
  executionHostId: AuthorityExecutionHostId
  title: string
  parentId?: string | null
  index?: number
  typeLabel?: string | null
  note?: string | null
}

export type TrackExternalIssueInput = {
  executionHostId: AuthorityExecutionHostId
  provider: ExternalIssueProvider
  identifier: string
  url: string
  titleSnapshot: string
  parentId?: string | null
  index?: number
  typeLabel?: string | null
  note?: string | null
}

export type UpdateIssueInput = {
  id: string
  expectedRecordRevision: number
  title?: string
  typeLabel?: string | null
  note?: string | null
}

// Why: a caller may not write a title without declaring who named it; untitled
// creation stays a no-op for existing call sites.
export type CreateConversationTitleInput =
  | { title?: null; titleSource?: null }
  | { title: string; titleSource: ConversationTitleSource }

export type CreateConversationInput = {
  executionHostId: AuthorityExecutionHostId
  workspaceRef: WorkspaceScope
  workspaceSnapshot: WorkspaceSnapshot
  agent: TuiAgent
  issueId?: string | null
} & CreateConversationTitleInput

export type UpdateConversationTitleInput = {
  id: string
  expectedRecordRevision: number
  title: string | null
}

export type BindConversationIssueInput = {
  id: string
  expectedRecordRevision: number
  issueId: string | null
}

export type RoundTextInput = {
  text?: string | null
  completeness?: RoundTextCompleteness
}

export type CreateRoundRecordInput = {
  conversationId: string
  kind: RoundRecord['kind']
  waitingReason?: RoundWaitingReason | null
  stateSource: RoundRecordStateSource
  occurredAt: number
  dedupeKey: string
  userInput?: RoundTextInput
  agentOutput?: RoundTextInput
  pendingQuestion?: RoundTextInput
  refs?: readonly RoundRecordRef[]
  authoritativeCurrentState?: boolean
}

export type MarkRoundReadInput = {
  id: string
  readAt: number
}

export type ResolveRoundInput = {
  id: string
  resolvedAt: number
  resolution: RoundResolution
}

export type RecordConversationLaunchFailureInput = {
  conversationId: string
  claimId: string
  expectedRecordRevision: number
  failure: string
  occurredAt?: number
}

export type ReparentIssueInput = {
  issueId: string
  parentId: string | null
  index: number
  expectedTreeRevision: number
}

export type ReparentIssueResult = {
  issue: IssueRecord
  affectedIssueIds: string[]
  factsRevision: number
  treeRevision: number
}

export type IssueLifecycleInput = {
  id: string
  expectedRecordRevision: number
}

export type CommitDeleteIssueInput = DeleteIssuePlan

export type CommitDeleteIssueResult = {
  deletedIssueId: string
  affectedIssueIds: string[]
  affectedConversationIds: string[]
  factsRevision: number
  treeRevision: number
}
