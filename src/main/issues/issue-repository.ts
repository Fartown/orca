import type { IssueMutationIdentity } from '../../shared/issues/types'
import { ConversationAllocator } from './conversation-allocator'
import { ConversationIdentityRepository } from './conversation-identity-repository'
import { ConversationLaunchClaimRepository } from './conversation-launch-claim-repository'
import { ConversationRecordRepository } from './conversation-record-repository'
import { IssueDatabase, type OpenIssueDatabaseOptions } from './issue-database'
import { IssueDeleteRepository } from './issue-delete-repository'
import { IssueHierarchyMutation } from './issue-hierarchy-mutation'
import { IssueLifecycleRepository } from './issue-lifecycle-repository'
import { IssueRecordRepository } from './issue-record-repository'
import { RoundRecordRepository } from './round-record-repository'

export class IssueRepository {
  readonly issues: IssueRecordRepository
  readonly conversations: ConversationRecordRepository
  readonly conversationIdentities: ConversationIdentityRepository
  readonly conversationLaunchClaims: ConversationLaunchClaimRepository
  readonly conversationAllocator: ConversationAllocator
  readonly rounds: RoundRecordRepository
  readonly issueHierarchy: IssueHierarchyMutation
  readonly issueLifecycle: IssueLifecycleRepository
  readonly issueDeletion: IssueDeleteRepository

  constructor(readonly database: IssueDatabase) {
    this.issues = new IssueRecordRepository(database)
    this.conversations = new ConversationRecordRepository(database)
    this.conversationIdentities = new ConversationIdentityRepository(database)
    this.conversationLaunchClaims = new ConversationLaunchClaimRepository(database)
    this.conversationAllocator = new ConversationAllocator(
      database,
      this.conversations,
      this.conversationIdentities,
      this.conversationLaunchClaims
    )
    this.rounds = new RoundRecordRepository(database)
    this.issueHierarchy = new IssueHierarchyMutation(database)
    this.issueLifecycle = new IssueLifecycleRepository(database)
    this.issueDeletion = new IssueDeleteRepository(database)
  }

  static open(options: OpenIssueDatabaseOptions): IssueRepository {
    return new IssueRepository(IssueDatabase.open(options))
  }

  close(): void {
    this.database.close()
  }
}

export function issueMutationIdentity(
  callerFingerprint: string,
  mutationId: string
): IssueMutationIdentity {
  return { callerFingerprint, mutationId }
}
