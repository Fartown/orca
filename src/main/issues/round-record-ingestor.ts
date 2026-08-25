import { createHash } from 'node:crypto'
import type { AgentStatusState } from '../../shared/agent-status-types'
import { isTuiAgent } from '../../shared/tui-agent-config'
import type {
  ConversationHookIdentityEvent,
  ConversationHookIdentityIngestor
} from './conversation-hook-identity-ingestor'
import type { IssueRepository } from './issue-repository'
import type { CreateRoundRecordInput } from './issue-repository-types'
import { createProviderTurnRefValue } from './round-record-provider-turn-ref'

export type RoundRecordHookEvent = ConversationHookIdentityEvent & {
  hasExplicitPrompt?: boolean
  promptInteractionKey?: string
  providerPromptId?: string
  providerTurnId?: string
  stateStartedAt: number
  payload: {
    state: AgentStatusState
    agentType?: ConversationHookIdentityEvent['payload']['agentType']
    prompt?: string
    interactivePrompt?: string
    lastAssistantMessage?: string
    sessionBoundary?: boolean
  }
}

export type RoundRecordIngestResult =
  | { disposition: 'persisted'; conversationId: string; roundId: string }
  | { disposition: 'resolved'; conversationId: string; roundIds: string[] }
  | {
      disposition: 'ignored'
      reason:
        | 'not-a-stable-state'
        | 'non-turn-status'
        | 'conversation-unresolved'
        | 'agent-unsupported'
    }

export type RoundRecordIngestorDependencies = {
  onDiagnostic?(result: RoundRecordIngestResult, event: RoundRecordHookEvent): void
  scheduleReconciliation?(conversationId: string): void
}

const INGEST_CALLER_FINGERPRINT = 'orca-round-hook-ingestor'

export class RoundRecordIngestor {
  private readonly paneQueues = new Map<string, Promise<void>>()

  constructor(
    private readonly repository: IssueRepository,
    private readonly identityIngestor: ConversationHookIdentityIngestor,
    private readonly dependencies: RoundRecordIngestorDependencies = {}
  ) {}

  ingest(event: RoundRecordHookEvent): Promise<RoundRecordIngestResult> {
    const previous = this.paneQueues.get(event.paneKey) ?? Promise.resolve()
    let resolveResult!: (result: RoundRecordIngestResult) => void
    let rejectResult!: (error: unknown) => void
    const result = new Promise<RoundRecordIngestResult>((resolve, reject) => {
      resolveResult = resolve
      rejectResult = reject
    })
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        try {
          resolveResult(await this.ingestOne(event))
        } catch (error) {
          rejectResult(error)
        }
      })
      .finally(() => {
        if (this.paneQueues.get(event.paneKey) === next) {
          this.paneQueues.delete(event.paneKey)
        }
      })
    this.paneQueues.set(event.paneKey, next)
    return result
  }

  private async ingestOne(event: RoundRecordHookEvent): Promise<RoundRecordIngestResult> {
    const identity = await this.identityIngestor.ingest(event)
    if (event.providerSessionOnly || event.restoredUnconfirmed || event.payload.sessionBoundary) {
      return this.finish({ disposition: 'ignored', reason: 'non-turn-status' }, event)
    }
    if (!isTuiAgent(event.payload.agentType)) {
      return this.finish({ disposition: 'ignored', reason: 'agent-unsupported' }, event)
    }
    if (!['done', 'waiting', 'blocked', 'working'].includes(event.payload.state)) {
      return this.finish({ disposition: 'ignored', reason: 'not-a-stable-state' }, event)
    }
    if (identity.disposition === 'ignored') {
      return this.finish({ disposition: 'ignored', reason: 'conversation-unresolved' }, event)
    }
    const conversationId = identity.conversationId
    const resolvedIds = this.resolvePriorObligations(conversationId, event)
    if (event.payload.state === 'working') {
      this.dependencies.scheduleReconciliation?.(conversationId)
      return this.finish({ disposition: 'resolved', conversationId, roundIds: resolvedIds }, event)
    }

    const input = createRoundInput(
      conversationId,
      event,
      this.providerTurnRefs(conversationId, event)
    )
    const round = this.repository.rounds.create({
      identity: {
        callerFingerprint: INGEST_CALLER_FINGERPRINT,
        mutationId: `persist:${hashValue(input)}`
      },
      input
    })
    this.dependencies.scheduleReconciliation?.(conversationId)
    return this.finish({ disposition: 'persisted', conversationId, roundId: round.id }, event)
  }

  private resolvePriorObligations(conversationId: string, event: RoundRecordHookEvent): string[] {
    const roundIds: string[] = []
    if (event.payload.state === 'working' || event.payload.state === 'done') {
      const waiting = this.repository.rounds.latestUnresolved(
        conversationId,
        'waiting',
        event.stateStartedAt
      )
      if (waiting) {
        this.repository.rounds.resolve({
          identity: {
            callerFingerprint: INGEST_CALLER_FINGERPRINT,
            mutationId: `resume:${waiting.id}:${event.stateStartedAt}`
          },
          input: {
            id: waiting.id,
            resolvedAt: event.stateStartedAt,
            resolution: 'resumed'
          }
        })
        roundIds.push(waiting.id)
      }
    }
    if (event.hasExplicitPrompt) {
      const completion = this.repository.rounds.latestUnresolved(
        conversationId,
        'completion',
        event.stateStartedAt
      )
      if (completion) {
        this.repository.rounds.resolve({
          identity: {
            callerFingerprint: INGEST_CALLER_FINGERPRINT,
            mutationId: `new-input:${completion.id}:${event.stateStartedAt}`
          },
          input: {
            id: completion.id,
            resolvedAt: event.stateStartedAt,
            resolution: 'new-input'
          }
        })
        roundIds.push(completion.id)
      }
    }
    return roundIds
  }

  private providerTurnRefs(
    conversationId: string,
    event: RoundRecordHookEvent
  ): CreateRoundRecordInput['refs'] {
    const providerTurnId = event.providerTurnId ?? event.providerPromptId
    if (!providerTurnId) {
      return undefined
    }
    const identity = this.repository.conversationIdentities
      .listForConversation(conversationId)
      .find((candidate) => candidate.retiredAt === null)
    if (!identity) {
      return undefined
    }
    return [
      {
        kind: 'provider-turn',
        value: createProviderTurnRefValue(identity.identityFingerprint, providerTurnId),
        reachable: true
      }
    ]
  }

  private finish(
    result: RoundRecordIngestResult,
    event: RoundRecordHookEvent
  ): RoundRecordIngestResult {
    this.dependencies.onDiagnostic?.(result, event)
    return result
  }
}

function createRoundInput(
  conversationId: string,
  event: RoundRecordHookEvent,
  refs: CreateRoundRecordInput['refs']
): CreateRoundRecordInput {
  const kind = event.payload.state === 'done' ? 'completion' : 'waiting'
  return {
    conversationId,
    kind,
    waitingReason:
      kind === 'completion'
        ? null
        : event.payload.state === 'blocked'
          ? 'blocked'
          : event.payload.interactivePrompt
            ? 'question'
            : 'other',
    stateSource: 'hook',
    occurredAt: event.stateStartedAt,
    dedupeKey: `round:hook:v1:${hashValue({
      conversationId,
      state: event.payload.state,
      stateStartedAt: event.stateStartedAt,
      providerTurnId: event.providerTurnId ?? event.providerPromptId ?? null,
      promptInteractionKey: event.promptInteractionKey ?? null
    })}`,
    userInput: { text: event.payload.prompt ?? null },
    agentOutput: { text: event.payload.lastAssistantMessage ?? null },
    pendingQuestion: { text: event.payload.interactivePrompt ?? null },
    refs,
    authoritativeCurrentState: kind === 'waiting'
  }
}

function hashValue(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
