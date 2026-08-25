import type { AgentProviderSessionMetadata } from '../../shared/agent-session-resume'
import type {
  ConversationLaunchClaim,
  ConversationLaunchPreparation,
  ConversationProviderIdentity,
  ConversationRecord,
  IssueMutationIdentity
} from '../../shared/issues/types'
import type { TuiAgent } from '../../shared/tui-agent'
import type { ConversationRecordRepository } from './conversation-record-repository'
import type { ConversationIdentityRepository } from './conversation-identity-repository'
import type {
  ConversationLaunchClaimRepository,
  ResolveConversationLaunchClaimInput
} from './conversation-launch-claim-repository'
import type { IssueDatabase } from './issue-database'
import { hostPartitionForExecutionHost } from './issue-host-partition'
import { executeIssueMutationWithReceipt } from './issue-mutation-receipt'
import { IssueRepositoryError } from './issue-repository-error'
import type { CreateConversationInput } from './issue-repository-types'
import type { RecordConversationLaunchFailureInput } from './issue-repository-types'

import {
  ConversationLaunchPreparationTransactions,
  sameConversationWorkspace,
  type PrepareConversationLaunchInput,
  type PrepareConversationResumeInput,
  type PrepareConversationRetryInput
} from './conversation-launch-preparation-transactions'

export type {
  PrepareConversationLaunchInput,
  PrepareConversationResumeInput,
  PrepareConversationRetryInput
} from './conversation-launch-preparation-transactions'

export type AttachConversationLaunchIdentityInput = Omit<
  ResolveConversationLaunchClaimInput,
  'hostPartitionKey'
> & {
  executionHostId: ConversationRecord['executionHostId']
  workspaceRef: ConversationRecord['workspaceRef']
  agent: TuiAgent
  providerSession: AgentProviderSessionMetadata
  resumeLocator?: string | null
  observedAt?: number
}

export type ResolveObservedConversationIdentityInput = CreateConversationInput & {
  providerSession: AgentProviderSessionMetadata
  resumeLocator?: string | null
  observedAt?: number
}

export class ConversationAllocator {
  private readonly launchPreparation: ConversationLaunchPreparationTransactions

  constructor(
    private readonly database: IssueDatabase,
    private readonly conversations: ConversationRecordRepository,
    private readonly identities: ConversationIdentityRepository,
    private readonly claims: ConversationLaunchClaimRepository,
    isConversationAttached: (conversationId: string) => boolean = () => false
  ) {
    this.launchPreparation = new ConversationLaunchPreparationTransactions(
      database,
      conversations,
      identities,
      claims,
      isConversationAttached
    )
  }

  prepareLaunch(params: {
    identity: IssueMutationIdentity
    input: PrepareConversationLaunchInput
  }): ConversationLaunchPreparation {
    return executeIssueMutationWithReceipt({
      database: this.database,
      identity: params.identity,
      method: 'conversations.prepareLaunch',
      payload: params.input,
      operation: () => this.launchPreparation.allocate(params.input, 'created')
    }).result
  }

  prepareResume(params: {
    identity: IssueMutationIdentity
    input: PrepareConversationResumeInput
  }): ConversationLaunchPreparation {
    return executeIssueMutationWithReceipt({
      database: this.database,
      identity: params.identity,
      method: 'conversations.prepareResume',
      payload: params.input,
      operation: () => this.launchPreparation.resume(params.input)
    }).result
  }

  prepareRetry(params: {
    identity: IssueMutationIdentity
    input: PrepareConversationRetryInput
  }): ConversationLaunchPreparation {
    return executeIssueMutationWithReceipt({
      database: this.database,
      identity: params.identity,
      method: 'conversations.prepareRetry',
      payload: params.input,
      operation: () => this.launchPreparation.retry(params.input)
    }).result
  }

  resolveObservedIdentityOrAllocate(input: ResolveObservedConversationIdentityInput): {
    conversation: ConversationRecord
    identity: ConversationProviderIdentity
    disposition: 'created' | 'replayed'
  } {
    return this.database.transaction(() => {
      const existingIdentity = this.identities.findActiveForExecutionHost({
        executionHostId: input.executionHostId,
        agent: input.agent,
        providerSession: input.providerSession
      })
      if (existingIdentity) {
        const conversation = this.requireConversation(existingIdentity.conversationId)
        assertConversationEvidenceMatches(conversation, input)
        const identity = this.identities.attachWithinTransaction({
          conversationId: conversation.id,
          agent: input.agent,
          providerSession: input.providerSession,
          resumeLocator: input.resumeLocator,
          observedAt: input.observedAt
        })
        return { conversation, identity, disposition: 'replayed' }
      }
      const conversation = this.conversations.createWithinTransaction({
        ...input,
        issueId: null
      })
      const identity = this.identities.attachWithinTransaction({
        conversationId: conversation.id,
        agent: input.agent,
        providerSession: input.providerSession,
        resumeLocator: input.resumeLocator,
        observedAt: input.observedAt
      })
      return { conversation, identity, disposition: 'created' }
    })
  }

  attachProviderIdentity(input: AttachConversationLaunchIdentityInput): {
    conversation: ConversationRecord
    identity: ConversationProviderIdentity
    claim: ConversationLaunchClaim | null
  } {
    return this.database.transaction(() => {
      const hostPartitionKey = hostPartitionForExecutionHost(input.executionHostId)
      const existingIdentity = this.identities.findActive({
        hostPartitionKey,
        agent: input.agent,
        providerSession: input.providerSession
      })
      if (existingIdentity) {
        const conversation = this.requireConversation(existingIdentity.conversationId)
        assertConversationEvidenceMatches(conversation, input)
        const claim = this.resolveOptionalClaim(input, hostPartitionKey)
        if (claim && claim.conversationId !== conversation.id) {
          throw new IssueRepositoryError(
            'conversation_identity_conflict',
            'Provider identity and launch claim resolve to different Conversations.'
          )
        }
        const refreshed = this.identities.attachWithinTransaction({
          conversationId: conversation.id,
          agent: input.agent,
          providerSession: input.providerSession,
          resumeLocator: input.resumeLocator,
          observedAt: input.observedAt
        })
        return {
          conversation,
          identity: refreshed,
          claim: claim
            ? this.claims.settleWithinTransaction(
                claim.claimId,
                'attached',
                input.observedAt ?? Date.now()
              )
            : null
        }
      }

      const claim = this.claims.resolveActiveWithinTransaction({
        hostPartitionKey,
        launchToken: input.launchToken,
        paneKey: input.paneKey,
        processIncarnation: input.processIncarnation,
        connectionId: input.connectionId,
        now: input.observedAt
      })
      const conversation = this.requireConversation(claim.conversationId)
      assertConversationEvidenceMatches(conversation, input)
      const identity = this.identities.attachWithinTransaction({
        conversationId: conversation.id,
        agent: input.agent,
        providerSession: input.providerSession,
        resumeLocator: input.resumeLocator,
        observedAt: input.observedAt
      })
      return {
        conversation,
        identity,
        claim: this.claims.settleWithinTransaction(
          claim.claimId,
          'attached',
          input.observedAt ?? Date.now()
        )
      }
    })
  }

  recordLaunchFailure(params: {
    identity: IssueMutationIdentity
    input: RecordConversationLaunchFailureInput
  }): ConversationRecord {
    const { input } = params
    return executeIssueMutationWithReceipt({
      database: this.database,
      identity: params.identity,
      method: 'conversations.recordLaunchFailure',
      payload: {
        conversationId: input.conversationId,
        claimId: input.claimId,
        expectedRecordRevision: input.expectedRecordRevision,
        failure: input.failure
      },
      operation: () => {
        const claim = this.claims.failPendingWithinTransaction(
          input.claimId,
          input.occurredAt ?? Date.now()
        )
        if (claim.conversationId !== input.conversationId) {
          throw new IssueRepositoryError(
            'conversation_launch_claim_invalid',
            'Launch failure claim belongs to another Conversation.'
          )
        }
        return this.conversations.recordLaunchFailureWithinTransaction(
          input.conversationId,
          input.expectedRecordRevision,
          input.failure,
          input.occurredAt
        )
      }
    }).result
  }

  private resolveOptionalClaim(
    input: AttachConversationLaunchIdentityInput,
    hostPartitionKey: ReturnType<typeof hostPartitionForExecutionHost>
  ): ConversationLaunchClaim | null {
    if (!input.launchToken && !input.paneKey && !input.processIncarnation && !input.connectionId) {
      return null
    }
    try {
      return this.claims.resolveActiveWithinTransaction({
        hostPartitionKey,
        launchToken: input.launchToken,
        paneKey: input.paneKey,
        processIncarnation: input.processIncarnation,
        connectionId: input.connectionId,
        now: input.observedAt
      })
    } catch (error) {
      if (
        error instanceof IssueRepositoryError &&
        (error.code === 'conversation_launch_claim_not_found' ||
          error.code === 'conversation_launch_claim_invalid' ||
          error.code === 'conversation_launch_claim_expired')
      ) {
        return null
      }
      throw error
    }
  }

  private requireConversation(id: string): ConversationRecord {
    const conversation = this.conversations.get(id)
    if (!conversation) {
      throw new IssueRepositoryError('conversation_not_found', `Conversation ${id} was not found.`)
    }
    return conversation
  }
}

function assertConversationEvidenceMatches(
  conversation: ConversationRecord,
  input: Pick<
    ResolveObservedConversationIdentityInput,
    'executionHostId' | 'workspaceRef' | 'agent'
  >
): void {
  if (
    conversation.executionHostId !== input.executionHostId ||
    conversation.agent !== input.agent ||
    !sameConversationWorkspace(conversation.workspaceRef, input.workspaceRef)
  ) {
    throw new IssueRepositoryError(
      'conversation_identity_conflict',
      'Provider identity evidence does not match the managed Conversation.'
    )
  }
}
