import type { ZodType } from 'zod'
import type {
  LocalTasksDispatcherRecordFactsInput,
  LocalTasksDispatcherRegisterInput,
  LocalTasksProposalsCreateInput,
  LocalTasksProposalsDecideInput,
  LocalTasksProposalsRecordResultsInput
} from '../../shared/local-tasks/local-task-dispatcher-rpc-params'
import {
  conversationSchema,
  proposalSchema
} from '../../shared/local-tasks/local-task-dispatcher-schemas'
import type { LocalTaskProgressSnapshot } from '../../shared/local-tasks/local-task-link-types'
import type {
  LocalTaskEventSource,
  LocalTaskFailure
} from '../../shared/local-tasks/local-task-types'
import type { LocalTasksDatabase } from './local-tasks-database'
import { LocalTaskDispatcher } from './local-task-dispatcher'
import { runLocalTaskWrite } from './local-task-mutation-receipts'
import { writeResultSchema } from '../../shared/local-tasks/local-task-result-schemas'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'

const EMPTY_RESULT = writeResultSchema({})
const CONVERSATION_RESULT = writeResultSchema({ conversation: conversationSchema })
const PROPOSAL_RESULT = writeResultSchema({ proposal: proposalSchema })
type ClaimLifetime = Pick<OrcaRuntimeService, 'registerSubscriptionCleanup' | 'cleanupSubscription'>
const claimSubscriptionId = (proposalId: string): string =>
  `local-task-proposal-owner:${proposalId}`

/** Receipt-backed writes for the dispatcher; task-library reads remain on LocalTasksService. */
export abstract class LocalTaskDispatcherService {
  readonly dispatcher: LocalTaskDispatcher
  private readonly claimLifetimes = new Map<string, ClaimLifetime>()

  constructor(
    private readonly dispatcherDb: LocalTasksDatabase,
    private readonly dispatcherNow: () => number
  ) {
    this.dispatcher = new LocalTaskDispatcher(
      dispatcherDb,
      () => this.dispatcherProgress(),
      () => this.dispatcherAttentionKeyMayReturn()
    )
    dispatcherDb.onClose(() => {
      for (const [proposalId, lifetime] of this.claimLifetimes) {
        lifetime.cleanupSubscription(claimSubscriptionId(proposalId))
      }
    })
  }

  protected abstract dispatcherProgress(): LocalTaskProgressSnapshot

  protected abstract dispatcherAttentionKeyMayReturn(): (key: string) => boolean

  registerDispatcher(input: LocalTasksDispatcherRegisterInput) {
    return this.writeDispatcher(
      input.clientOperationId,
      'dispatcher.register',
      input,
      CONVERSATION_RESULT,
      (now) => this.dispatcher.register(input.paneKey, input.agent, now, input.previousPaneKey)
    )
  }

  createProposal(input: LocalTasksProposalsCreateInput) {
    return this.writeDispatcher(
      input.clientOperationId,
      'proposals.create',
      input,
      PROPOSAL_RESULT,
      (now) => this.dispatcher.createProposal(input, now)
    )
  }

  decideProposal(input: LocalTasksProposalsDecideInput, source: LocalTaskEventSource) {
    return this.writeDispatcher(
      input.clientOperationId,
      'proposals.decide',
      input,
      PROPOSAL_RESULT,
      (now) => this.dispatcher.decide(input, source, now)
    )
  }

  claimProposal(
    input: { clientOperationId: string; proposalId: string },
    connectionId: string,
    lifetime: ClaimLifetime,
    connectionSignal?: AbortSignal
  ) {
    const current = this.dispatcher.proposalResult(input.proposalId)
    if (
      !connectionId ||
      connectionSignal?.aborted ||
      !current.ok ||
      (current.proposal.status !== 'confirmed' &&
        !(
          current.proposal.status === 'executing' &&
          this.dispatcher.ownership.ownerOf(input.proposalId) === connectionId
        ))
    ) {
      return { ok: false as const, code: 'stale' as const, detail: 'execution-owner' }
    }
    const result = this.writeDispatcher(
      input.clientOperationId,
      'proposals.claim',
      input,
      PROPOSAL_RESULT,
      (now) => {
        if (connectionSignal?.aborted) {
          return { ok: false, code: 'stale', detail: 'execution-owner' }
        }
        const claimed = this.dispatcher.claim(input.proposalId, connectionId, now)
        if (claimed.ok) {
          lifetime.registerSubscriptionCleanup(
            claimSubscriptionId(input.proposalId),
            () => {
              this.claimLifetimes.delete(input.proposalId)
              this.dispatcher.ownership.retire(input.proposalId, connectionId)
            },
            connectionId
          )
          this.claimLifetimes.set(input.proposalId, lifetime)
        }
        return claimed
      }
    )
    return result.ok ? this.dispatcher.proposalResult(input.proposalId) : result
  }

  /**
   * The claiming window gives up a run it can no longer report on, so the claim retires now rather
   * than when its connection closes, and a person can close the proposal out (D-018).
   */
  releaseProposal(
    input: { clientOperationId: string; proposalId: string },
    connectionId: string,
    lifetime: ClaimLifetime
  ) {
    if (!connectionId || this.dispatcher.ownership.ownerOf(input.proposalId) !== connectionId) {
      return { ok: false as const, code: 'stale' as const, detail: 'execution-owner' }
    }
    lifetime.cleanupSubscription(claimSubscriptionId(input.proposalId))
    return this.dispatcher.proposalResult(input.proposalId)
  }

  recordProposalResults(
    input: LocalTasksProposalsRecordResultsInput,
    connectionId: string,
    lifetime: ClaimLifetime,
    connectionSignal?: AbortSignal
  ) {
    const current = this.dispatcher.proposalResult(input.proposalId)
    const owner = this.dispatcher.ownership.ownerOf(input.proposalId)
    if (
      !connectionId ||
      connectionSignal?.aborted ||
      !current.ok ||
      current.proposal.status !== 'executing' ||
      (owner ? owner !== connectionId : input.results.length > 0 || input.finalize === false)
    ) {
      return { ok: false as const, code: 'stale' as const, detail: 'execution-owner' }
    }
    const result = this.writeDispatcher(
      input.clientOperationId,
      'proposals.results',
      input,
      PROPOSAL_RESULT,
      (now) => {
        const recorded = this.dispatcher.recordResults(input, connectionId, now)
        if (recorded.ok && recorded.proposal.status === 'executed' && owner) {
          lifetime.cleanupSubscription(claimSubscriptionId(input.proposalId))
        }
        return recorded
      }
    )
    return result.ok ? this.dispatcher.proposalResult(input.proposalId) : result
  }

  watchTask(input: {
    clientOperationId: string
    paneKey: string
    taskId: string
    replacesRef?: string
  }) {
    return this.writeDispatcher(
      input.clientOperationId,
      'dispatcher.watch',
      input,
      EMPTY_RESULT,
      (now) => this.dispatcher.watch(input.paneKey, input.taskId, now, input.replacesRef)
    )
  }

  unwatchTask(input: { clientOperationId: string; paneKey: string; taskId: string }) {
    return this.writeDispatcher(
      input.clientOperationId,
      'dispatcher.unwatch',
      input,
      EMPTY_RESULT,
      () => this.dispatcher.unwatch(input.paneKey, input.taskId)
    )
  }

  recordDispatcherFacts(input: LocalTasksDispatcherRecordFactsInput) {
    return this.writeDispatcher(
      input.clientOperationId,
      'dispatcher.recordFacts',
      input,
      EMPTY_RESULT,
      () => this.dispatcher.recordFacts(input.paneKey, input.facts)
    )
  }

  ackInbox(input: { clientOperationId: string; paneKey: string; cursor: string }) {
    return this.writeDispatcher(
      input.clientOperationId,
      'dispatcher.ack',
      input,
      EMPTY_RESULT,
      (now) => this.dispatcher.ack(input.paneKey, input.cursor, now)
    )
  }

  private writeDispatcher<T extends { ok: boolean }>(
    operationId: string,
    method: string,
    params: unknown,
    schema: ZodType<T>,
    operation: (now: number) => T
  ): T | LocalTaskFailure {
    return runLocalTaskWrite(
      this.dispatcherDb,
      this.dispatcherNow(),
      operationId,
      method,
      params,
      schema,
      operation
    )
  }
}
