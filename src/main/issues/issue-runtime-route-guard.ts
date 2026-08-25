import type {
  AuthorityExecutionHostId,
  ConversationRecord,
  IssueRecord,
  RoundRecord
} from '../../shared/issues/types'
import { resolveIssueAuthorityRoute, type ManagedSshTargetResolver } from './issue-authority-route'
import type { IssueRepository } from './issue-repository'
import { IssueRepositoryError } from './issue-repository-error'

export class IssueRuntimeRouteGuard {
  constructor(
    private readonly repository: IssueRepository,
    private readonly managedSshTargets?: ManagedSshTargetResolver
  ) {}

  resolve(executionHostId: AuthorityExecutionHostId) {
    return resolveIssueAuthorityRoute(executionHostId, this.managedSshTargets)
  }

  requireIssue(executionHostId: AuthorityExecutionHostId, issueId: string): IssueRecord {
    const issue = this.repository.issues.get(issueId)
    if (!issue || issue.hostPartitionKey !== this.resolve(executionHostId).hostPartitionKey) {
      throw new IssueRepositoryError('issue_not_found', `Issue ${issueId} was not found.`)
    }
    return issue
  }

  requireConversation(
    executionHostId: AuthorityExecutionHostId,
    conversationId: string
  ): ConversationRecord {
    const conversation = this.repository.conversations.get(conversationId)
    if (
      !conversation ||
      conversation.hostPartitionKey !== this.resolve(executionHostId).hostPartitionKey
    ) {
      throw new IssueRepositoryError(
        'conversation_not_found',
        `Conversation ${conversationId} was not found.`
      )
    }
    return conversation
  }

  requireRound(executionHostId: AuthorityExecutionHostId, roundId: string): RoundRecord {
    const round = this.repository.rounds.get(roundId)
    if (!round) {
      throw new IssueRepositoryError('round_not_found', `Round ${roundId} was not found.`)
    }
    this.requireConversation(executionHostId, round.conversationId)
    return round
  }
}
