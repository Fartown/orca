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
import type {
  CreateConversationInput,
  RecordConversationLaunchFailureInput
} from './issue-repository-types'

import { ConversationLaunchFailureTransactions } from './conversation-launch-failure-transactions'
import {
  ConversationLaunchPreparationTransactions,
  type PrepareConversationLaunchInput,
  type PrepareConversationRetryInput
} from './conversation-launch-preparation-transactions'
import {
  assertConversationRuntimeEvidenceMatches,
  clearConversationLaunchFailureFromRuntimeEvidence
} from './conversation-runtime-evidence-validation'

export type {
  PrepareConversationLaunchInput,
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
  private readonly launchFailures: ConversationLaunchFailureTransactions
  private readonly launchPreparation: ConversationLaunchPreparationTransactions

  constructor(
    private readonly database: IssueDatabase,
    private readonly conversations: ConversationRecordRepository,
    private readonly identities: ConversationIdentityRepository,
    private readonly claims: ConversationLaunchClaimRepository,
    hasConversationRuntimeEvidence: (conversationId: string) => boolean = () => false
  ) {
    this.launchFailures = new ConversationLaunchFailureTransactions(
      database,
      conversations,
      claims,
      hasConversationRuntimeEvidence
    )
    this.launchPreparation = new ConversationLaunchPreparationTransactions(
      database,
      conversations,
      identities,
      claims,
      hasConversationRuntimeEvidence
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
        let conversation = this.requireConversation(existingIdentity.conversationId)
        assertConversationRuntimeEvidenceMatches(conversation, input)
        conversation = clearConversationLaunchFailureFromRuntimeEvidence(
          this.conversations,
          conversation,
          input.observedAt
        )
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
        let conversation = this.requireConversation(existingIdentity.conversationId)
        assertConversationRuntimeEvidenceMatches(conversation, input)
        const claim = this.resolveOptionalClaim(input, hostPartitionKey)
        if (claim && claim.conversationId !== conversation.id) {
          throw new IssueRepositoryError(
            'conversation_identity_conflict',
            'Provider identity and launch claim resolve to different Conversations.'
          )
        }
        conversation = clearConversationLaunchFailureFromRuntimeEvidence(
          this.conversations,
          conversation,
          input.observedAt
        )
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
      let conversation = this.requireConversation(claim.conversationId)
      assertConversationRuntimeEvidenceMatches(conversation, input)
      conversation = clearConversationLaunchFailureFromRuntimeEvidence(
        this.conversations,
        conversation,
        input.observedAt
      )
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
    return this.launchFailures.record(params)
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
