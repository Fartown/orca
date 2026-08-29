import { createHash } from 'node:crypto'
import { resolveNativeChatTranscriptAgent } from '../../shared/native-chat-agent-support'
import type { RoundRecord } from '../../shared/issues/types'
import type { NativeChatMessage } from '../../shared/native-chat-types'
import {
  readNativeChatTranscript,
  type ReadTranscriptResult
} from '../native-chat/transcript-reader'
import type { IssueRepository } from './issue-repository'
import { createProviderTurnRefValue } from './round-record-provider-turn-ref'
import {
  buildRoundTranscriptFacts,
  type RoundTranscriptFact
} from './round-record-transcript-facts'

export type RoundRecordReconciliationResult =
  | {
      disposition: 'reconciled'
      conversationId: string
      createdRoundIds: string[]
      upgradedRoundIds: string[]
      unchangedRoundIds: string[]
    }
  | {
      disposition: 'skipped'
      conversationId: string
      reason:
        | 'conversation-missing'
        | 'identity-missing'
        | 'provider-unsupported'
        | 'remote-transcript-unavailable'
        | 'transcript-not-found'
        | 'transcript-read-failed'
      detail?: string
    }

export type RoundRecordReconcilerDependencies = {
  readTranscript?: typeof readNativeChatTranscript
  onDiagnostic?(result: RoundRecordReconciliationResult): void
}

export class RoundRecordReconciler {
  private readonly scheduled = new Map<string, Promise<RoundRecordReconciliationResult>>()

  constructor(
    private readonly repository: IssueRepository,
    private readonly dependencies: RoundRecordReconcilerDependencies = {}
  ) {}

  schedule(conversationId: string): Promise<RoundRecordReconciliationResult> {
    const existing = this.scheduled.get(conversationId)
    if (existing) {
      return existing
    }
    const scheduled = Promise.resolve()
      .then(() => this.reconcile(conversationId))
      .finally(() => {
        if (this.scheduled.get(conversationId) === scheduled) {
          this.scheduled.delete(conversationId)
        }
      })
    this.scheduled.set(conversationId, scheduled)
    return scheduled
  }

  async reconcile(conversationId: string): Promise<RoundRecordReconciliationResult> {
    const conversation = this.repository.conversations.get(conversationId)
    if (!conversation) {
      return this.finish({ disposition: 'skipped', conversationId, reason: 'conversation-missing' })
    }
    if (!resolveNativeChatTranscriptAgent(conversation.agent)) {
      return this.finish({ disposition: 'skipped', conversationId, reason: 'provider-unsupported' })
    }
    if (conversation.hostPartitionKey !== 'local') {
      return this.finish({
        disposition: 'skipped',
        conversationId,
        reason: 'remote-transcript-unavailable'
      })
    }
    const identity = this.repository.conversationIdentities
      .listForConversation(conversationId)
      .find((candidate) => candidate.retiredAt === null)
    if (!identity) {
      return this.finish({ disposition: 'skipped', conversationId, reason: 'identity-missing' })
    }

    let readResult: ReadTranscriptResult
    try {
      readResult = await (this.dependencies.readTranscript ?? readNativeChatTranscript)(
        conversation.agent,
        identity.session.id,
        { transcriptPath: identity.session.transcriptPath }
      )
    } catch (error) {
      return this.finish({
        disposition: 'skipped',
        conversationId,
        reason: 'transcript-read-failed',
        detail: error instanceof Error ? error.message : String(error)
      })
    }
    if (!('messages' in readResult)) {
      return this.finish({
        disposition: 'skipped',
        conversationId,
        reason: readResult.notFound ? 'transcript-not-found' : 'transcript-read-failed',
        detail: readResult.error
      })
    }

    const facts = buildRoundTranscriptFacts(readResult.messages)
    const createdRoundIds: string[] = []
    const upgradedRoundIds: string[] = []
    const unchangedRoundIds: string[] = []
    const reconciledFacts: { fact: RoundTranscriptFact; round: RoundRecord }[] = []
    for (const fact of facts) {
      const outcome = this.reconcileFact(conversationId, identity.identityFingerprint, fact)
      reconciledFacts.push({ fact, round: outcome.round })
      if (outcome.disposition === 'created') {
        createdRoundIds.push(outcome.round.id)
      } else if (outcome.disposition === 'upgraded') {
        upgradedRoundIds.push(outcome.round.id)
      } else {
        unchangedRoundIds.push(outcome.round.id)
      }
    }
    this.resolveHistoricalCompletions(reconciledFacts, readResult.messages)
    return this.finish({
      disposition: 'reconciled',
      conversationId,
      createdRoundIds,
      upgradedRoundIds,
      unchangedRoundIds
    })
  }

  private reconcileFact(
    conversationId: string,
    identityFingerprint: string,
    fact: RoundTranscriptFact
  ): { disposition: 'created' | 'upgraded' | 'unchanged'; round: RoundRecord } {
    const providerRef = fact.providerTurnId
      ? {
          kind: 'provider-turn',
          value: createProviderTurnRefValue(identityFingerprint, fact.providerTurnId),
          reachable: true
        }
      : null
    const transcriptRef = {
      kind: 'transcript-fact',
      value: scopedFactValue(identityFingerprint, fact.factKey),
      reachable: true
    }
    const existing = providerRef
      ? this.repository.rounds.findByRef(providerRef)
      : this.repository.rounds.findByRef(transcriptRef)
    const before = existing ? JSON.stringify(existing) : null
    const round = this.repository.rounds.reconcileTranscriptFact({
      conversationId,
      kind: 'completion',
      stateSource: 'reconciled',
      occurredAt: existing?.occurredAt ?? fact.occurredAt,
      dedupeKey: existing?.dedupeKey ?? `round:reconciled:v1:${transcriptRef.value}`,
      userInput: { text: fact.userInput ?? null },
      agentOutput: { text: fact.agentOutput },
      refs: providerRef ? [providerRef, transcriptRef] : [transcriptRef]
    })
    return {
      disposition: !existing
        ? 'created'
        : JSON.stringify(round) === before
          ? 'unchanged'
          : 'upgraded',
      round
    }
  }

  private resolveHistoricalCompletions(
    reconciledFacts: readonly { fact: RoundTranscriptFact; round: RoundRecord }[],
    messages: readonly NativeChatMessage[]
  ): void {
    const userInputTimes = messages
      .filter((message) => message.role === 'user' && message.timestamp !== null)
      .map((message) => message.timestamp as number)
      .sort((left, right) => left - right)
    for (const { fact, round } of reconciledFacts) {
      if (round.resolvedAt !== null) {
        continue
      }
      const completedAt = fact.finalizedAt ?? fact.occurredAt
      const resolvedAt = userInputTimes.find((timestamp) => timestamp > completedAt)
      if (resolvedAt === undefined) {
        continue
      }
      this.repository.rounds.resolveReconciledHistory({
        id: round.id,
        resolvedAt,
        resolution: 'new-input'
      })
    }
  }

  private finish(result: RoundRecordReconciliationResult): RoundRecordReconciliationResult {
    this.dependencies.onDiagnostic?.(result)
    return result
  }
}

function scopedFactValue(identityFingerprint: string, factKey: string): string {
  return `v1:${createHash('sha256')
    .update(JSON.stringify([identityFingerprint, factKey]))
    .digest('hex')}`
}
