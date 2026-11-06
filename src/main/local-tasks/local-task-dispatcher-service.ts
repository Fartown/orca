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

const EMPTY_RESULT = writeResultSchema({})
const CONVERSATION_RESULT = writeResultSchema({ conversation: conversationSchema })
const PROPOSAL_RESULT = writeResultSchema({ proposal: proposalSchema })

/** Receipt-backed writes for the dispatcher; task-library reads remain on LocalTasksService. */
export abstract class LocalTaskDispatcherService {
  readonly dispatcher: LocalTaskDispatcher

  constructor(
    private readonly dispatcherDb: LocalTasksDatabase,
    private readonly dispatcherNow: () => number
  ) {
    this.dispatcher = new LocalTaskDispatcher(dispatcherDb, () => this.dispatcherProgress())
  }

  protected abstract dispatcherProgress(): LocalTaskProgressSnapshot

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

  claimProposal(input: { clientOperationId: string; proposalId: string }) {
    return this.writeDispatcher(
      input.clientOperationId,
      'proposals.claim',
      input,
      PROPOSAL_RESULT,
      (now) => this.dispatcher.claim(input.proposalId, now)
    )
  }

  recordProposalResults(input: LocalTasksProposalsRecordResultsInput) {
    return this.writeDispatcher(
      input.clientOperationId,
      'proposals.results',
      input,
      PROPOSAL_RESULT,
      (now) => this.dispatcher.recordResults(input, now)
    )
  }

  watchTask(input: { clientOperationId: string; paneKey: string; taskId: string }) {
    return this.writeDispatcher(
      input.clientOperationId,
      'dispatcher.watch',
      input,
      EMPTY_RESULT,
      (now) => this.dispatcher.watch(input.paneKey, input.taskId, now)
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
