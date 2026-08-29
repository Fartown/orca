import type { AgentProviderSessionMetadata } from '../agent-session-resume'
import type { ExecutionHostId } from '../execution-host'
import type { WorkspaceScope } from '../folder-workspace-types'
import type { TuiAgent } from '../tui-agent'
import type {
  ISSUE_STATES,
  ROUND_RECORD_KINDS,
  ROUND_RECORD_STATE_SOURCES,
  ROUND_RESOLUTIONS,
  ROUND_TEXT_COMPLETENESS,
  ROUND_WAITING_REASONS
} from './constants'

export type AuthorityExecutionHostId = 'local' | `ssh:${string}`
export type AuthorityHostPartitionKey = AuthorityExecutionHostId
export type IssueRouteExecutionHostId = ExecutionHostId
export type IssueState = (typeof ISSUE_STATES)[number]
export type RoundRecordKind = (typeof ROUND_RECORD_KINDS)[number]
export type RoundWaitingReason = (typeof ROUND_WAITING_REASONS)[number]
export type RoundRecordStateSource = (typeof ROUND_RECORD_STATE_SOURCES)[number]
export type RoundTextCompleteness = (typeof ROUND_TEXT_COMPLETENESS)[number]
export type RoundResolution = (typeof ROUND_RESOLUTIONS)[number]

export type LocalIssueSource = {
  kind: 'local'
  number: number
}

export type ExternalIssueProvider = 'github' | 'gitlab' | 'linear' | 'jira' | 'other'

export type ExternalIssueSource = {
  kind: 'external'
  provider: ExternalIssueProvider
  identifier: string
  url: string
  titleSnapshot: string
}

export type IssueSource = LocalIssueSource | ExternalIssueSource

export type WorkspaceSnapshot = {
  name: string
  path: string
}

export type IssueRecord = {
  id: string
  hostPartitionKey: AuthorityHostPartitionKey
  executionHostId: AuthorityExecutionHostId
  source: IssueSource
  localTitle: string | null
  typeLabel: string | null
  note: string | null
  state: IssueState
  parentId: string | null
  siblingOrder: number
  recordRevision: number
  createdAt: number
  updatedAt: number
  archivedAt: number | null
}

export type ConversationLaunchFailure = {
  message: string
  failedAt: number
}

export type ConversationRecord = {
  id: string
  hostPartitionKey: AuthorityHostPartitionKey
  executionHostId: AuthorityExecutionHostId
  workspaceRef: WorkspaceScope
  workspaceSnapshot: WorkspaceSnapshot
  agent: TuiAgent
  title: string | null
  issueId: string | null
  recordRevision: number
  launchFailure: ConversationLaunchFailure | null
  createdAt: number
  updatedAt: number
}

export type ConversationProviderIdentity = {
  id: string
  conversationId: string
  hostPartitionKey: AuthorityHostPartitionKey
  agent: TuiAgent
  session: AgentProviderSessionMetadata
  identityFingerprint: string
  resumeLocator: string | null
  observedAt: number
  retiredAt: number | null
}

export type ConversationLaunchClaimSettlement = 'attached' | 'failed' | 'expired' | 'retired'

export type ConversationLaunchClaim = {
  claimId: string
  conversationId: string
  hostPartitionKey: AuthorityHostPartitionKey
  launchTokenFingerprint: string
  paneKey: string | null
  processIncarnation: string | null
  connectionId: string | null
  createdAt: number
  expiresAt: number
  settledAt: number | null
  settlement: ConversationLaunchClaimSettlement | null
}

export type RoundTextPreview = {
  text: string | null
  completeness: RoundTextCompleteness
}

export type RoundRecordRef = {
  kind: string
  value: string
  reachable: boolean | null
}

export type RoundRecord = {
  id: string
  conversationId: string
  kind: RoundRecordKind
  waitingReason: RoundWaitingReason | null
  stateSource: RoundRecordStateSource
  occurredAt: number
  dedupeKey: string
  userInput: RoundTextPreview
  agentOutput: RoundTextPreview
  pendingQuestion: RoundTextPreview
  readAt: number | null
  resolvedAt: number | null
  resolution: RoundResolution | null
  createdAt: number
}

export type RoundRecordPreview = Omit<RoundRecord, 'dedupeKey'>

export type IssueAuthorityDescriptor = {
  authorityId: string
  hostPartitionKey: AuthorityHostPartitionKey
  authorityExecutionHostId: AuthorityExecutionHostId
  profileLabel?: string
}

export type EffectiveConversationProject =
  | {
      kind: 'project'
      projectId: string
      projectHostSetupId?: string
      repoId?: string
    }
  | { kind: 'legacy-repo'; repoId: string }
  | null

export type ConversationAttachmentSummary =
  | { kind: 'attached'; paneKey: string; tabId: string | null }
  | { kind: 'detached' }

export type ConversationNavigationHint = {
  paneKey: string | null
  providerSession: AgentProviderSessionMetadata | null
  resumeLocator: string | null
}

export type ConversationLivenessVerdict = 'live' | 'unverifiable' | 'exited'

export type ConversationSummary = ConversationRecord & {
  effectiveProjectRef: EffectiveConversationProject
  attachment: ConversationAttachmentSummary
  resumability: 'resumable' | 'unavailable'
  executionState: 'launching' | 'running' | 'waiting' | 'stopped' | 'failed'
  /** Optional for mixed-version hosts; missing means the older host did not publish a verdict. */
  livenessVerdict?: ConversationLivenessVerdict
  workspaceAvailability: 'available' | 'unavailable'
  unresolvedRoundCount: number
  latestRound: RoundRecordPreview | null
  navigation?: ConversationNavigationHint
}

export type IssueSummary = IssueRecord & {
  ownUnresolvedCount: number
  descendantAttentionCount: number
  directConversationCount: number
  runningConversationCount: number
}

export type UnassignedConversationSummary = {
  conversationCount: number
  unresolvedCount: number
}

export type IssueDetail = {
  authority: IssueAuthorityDescriptor
  issue: IssueSummary
  directChildren: IssueSummary[]
  directConversations: ConversationSummary[]
  workspaceSnapshots: WorkspaceSnapshot[]
}

export type IssueListFilter = 'all' | 'needs-me' | 'archived'

export type IssueFeatureReadiness = {
  status: 'ready' | 'degraded' | 'unavailable'
  storage: 'ready' | 'failed'
  hookEvidence: 'ready' | 'disabled' | 'failed'
  reason:
    | 'storage-open-failed'
    | 'storage-migration-failed'
    | 'hook-disabled'
    | 'hook-start-failed'
    | null
}

export type IssueMutationIdentity = {
  callerFingerprint: string
  mutationId: string
}

export type IssueMutationResult = {
  authority: IssueAuthorityDescriptor
  factsRevision: number
  treeRevision: number
  affectedIssueIds: string[]
  affectedConversationIds: string[]
  affectedRoundRecordIds: string[]
}

export type IssueSnapshotPage = {
  status: 'snapshot-page'
  authority: IssueAuthorityDescriptor
  snapshotFactsRevision: number
  snapshotTreeRevision: number
  snapshotRuntimeRevision?: number
  issues: IssueSummary[]
  unassigned?: UnassignedConversationSummary
  nextCursor: string | null
}

export type IssueListResult =
  | IssueSnapshotPage
  | {
      status: 'not-modified'
      authority: IssueAuthorityDescriptor
      factsRevision: number
      treeRevision: number
      runtimeRevision?: number
    }
  | {
      status: 'stale'
      authority: IssueAuthorityDescriptor
      factsRevision: number
      treeRevision: number
      runtimeRevision?: number
    }

export type ConversationPage =
  | {
      status: 'snapshot-page'
      authority: IssueAuthorityDescriptor
      snapshotFactsRevision: number
      snapshotRuntimeRevision?: number
      conversations: ConversationSummary[]
      nextCursor: string | null
    }
  | {
      status: 'not-modified'
      authority: IssueAuthorityDescriptor
      factsRevision: number
      runtimeRevision?: number
    }
  | {
      status: 'stale'
      authority: IssueAuthorityDescriptor
      factsRevision: number
      runtimeRevision?: number
    }

export type RoundRecordPage =
  | {
      status: 'snapshot-page'
      authority: IssueAuthorityDescriptor
      snapshotFactsRevision: number
      rounds: RoundRecordPreview[]
      nextCursor: string | null
    }
  | {
      status: 'not-modified'
      authority: IssueAuthorityDescriptor
      factsRevision: number
    }
  | {
      status: 'stale'
      authority: IssueAuthorityDescriptor
      factsRevision: number
    }

export type DeleteIssueChildDestination = { kind: 'root' } | { kind: 'parent'; parentId: string }

export type DeleteIssuePlan = {
  issueId: string
  snapshotFactsRevision: number
  snapshotTreeRevision: number
  children: {
    issueId: string
    destination: DeleteIssueChildDestination
    index: number
  }[]
  conversations: {
    conversationId: string
    destinationIssueId: string | null
  }[]
}

export type ConversationDeletePreparation = {
  conversation: ConversationRecord
  issueId: string | null
  identityCount: number
  roundCount: number
  unresolvedRoundCount: number
  hasTranscriptLocator: boolean
  attachmentState: 'attached' | 'detached'
  canDelete: boolean
  blockers: ('attached' | 'running' | 'waiting' | 'pending-claim')[]
  preflightToken: string | null
}

export type ConversationLaunchPreparation = {
  conversation: ConversationRecord
  claimId: string
  disposition: 'created' | 'replayed' | 'retried'
}
