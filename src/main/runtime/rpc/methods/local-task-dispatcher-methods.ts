import {
  LocalTasksDispatcherAckParams,
  LocalTasksDispatcherInboxParams,
  LocalTasksDispatcherRegisterParams,
  LocalTasksDispatcherWatchParams,
  LocalTasksDispatcherWatchesParams,
  LocalTasksProposalsCreateParams,
  LocalTasksProposalsDecideParams,
  LocalTasksProposalsListParams,
  LocalTasksProposalsRecordResultsParams
} from '../../../../shared/local-tasks/local-task-dispatcher-rpc-params'
import type { LocalTaskFailure } from '../../../../shared/local-tasks/local-task-types'
import { localTasksReadiness } from '../../../local-tasks/local-tasks-readiness'
import { sourceOf } from '../../../local-tasks/local-tasks-rpc-caller'
import type { LocalTasksService } from '../../../local-tasks/local-tasks-service'
import { defineMethod } from '../core'

const DESKTOP_ONLY: LocalTaskFailure = { ok: false, code: 'desktop_only' }

/** A desktop window registers its dispatcher pane and reports what it executed. */
export const LOCAL_TASK_DISPATCHER_DESKTOP_METHODS: readonly string[] = [
  'localTasks.dispatcher.register',
  'localTasks.proposals.recordResults'
]

/** The dispatcher session's own CLI calls; a phone speaks for the person, never as the dispatcher. */
export const LOCAL_TASK_DISPATCHER_SESSION_METHODS: readonly string[] = [
  'localTasks.dispatcher.inbox',
  'localTasks.dispatcher.ack',
  'localTasks.dispatcher.watch',
  'localTasks.dispatcher.unwatch',
  'localTasks.proposals.create'
]

function service(): LocalTasksService {
  return localTasksReadiness.requireService()
}

/**
 * The dispatcher session (REQ-030, REQ-031). Its CLI calls name its pane; only a desktop window
 * registers a dispatcher or reports what it executed, and only a person decides a proposal.
 */
export const LOCAL_TASK_DISPATCHER_METHODS = [
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.dispatcher.register',
    params: LocalTasksDispatcherRegisterParams,
    handler: (params, context) =>
      sourceOf(context) === 'desktop' ? service().registerDispatcher(params) : DESKTOP_ONLY
  }),
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.dispatcher.inbox',
    params: LocalTasksDispatcherInboxParams,
    handler: (params) => service().dispatcher.inbox(params.paneKey, params.limit)
  }),
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.dispatcher.watches',
    params: LocalTasksDispatcherWatchesParams,
    handler: (params) => service().dispatcher.watches(params.paneKey)
  }),
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.dispatcher.ack',
    params: LocalTasksDispatcherAckParams,
    handler: (params) => service().ackInbox(params)
  }),
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.dispatcher.watch',
    params: LocalTasksDispatcherWatchParams,
    handler: (params) => service().watchTask(params)
  }),
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.dispatcher.unwatch',
    params: LocalTasksDispatcherWatchParams,
    handler: (params) => service().unwatchTask(params)
  }),
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.proposals.create',
    params: LocalTasksProposalsCreateParams,
    handler: (params) => service().createProposal(params)
  }),
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.proposals.list',
    params: LocalTasksProposalsListParams,
    handler: (params) => service().dispatcher.listProposals(params)
  }),
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.proposals.decide',
    params: LocalTasksProposalsDecideParams,
    handler: (params, context) => service().decideProposal(params, sourceOf(context))
  }),
  defineMethod({
    permission: 'workspace',
    name: 'localTasks.proposals.recordResults',
    params: LocalTasksProposalsRecordResultsParams,
    handler: (params, context) =>
      sourceOf(context) === 'desktop' ? service().recordProposalResults(params) : DESKTOP_ONLY
  })
]
