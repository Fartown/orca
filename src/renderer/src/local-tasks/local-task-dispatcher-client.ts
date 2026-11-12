import { z } from 'zod'
import {
  conversationSchema,
  inboxSchema,
  proposalSchema,
  watchSchema
} from '../../../shared/local-tasks/local-task-dispatcher-schemas'
import type {
  LocalTaskForwardedFact,
  LocalTaskProposalItemResult
} from '../../../shared/local-tasks/local-task-dispatcher-types'
import { writeResultSchema } from '../../../shared/local-tasks/local-task-result-schemas'
import { SELF_LOCAL_TASK_ENDPOINT } from './local-task-endpoints'
import { callLocalTasks, writeLocalTasks } from './local-tasks-endpoint-calls'

// Why only this window's own library: the dispatcher runs in its floating workspace (REQ-030).
const conversationResult = writeResultSchema({ conversation: conversationSchema })
const proposalResult = writeResultSchema({ proposal: proposalSchema })
const inboxResult = writeResultSchema({ inbox: inboxSchema })
const watchesResult = writeResultSchema({ watches: z.array(watchSchema) })
const okResult = writeResultSchema({})

export const localTaskDispatcherClient = {
  register: (paneKey: string, agent: string, previousPaneKey?: string | null) =>
    writeLocalTasks(
      SELF_LOCAL_TASK_ENDPOINT,
      'localTasks.dispatcher.register',
      { paneKey, agent, ...(previousPaneKey ? { previousPaneKey } : {}) },
      conversationResult
    ),
  list: (status: 'pending' | 'confirmed' | 'executing' | 'executed') =>
    callLocalTasks(
      SELF_LOCAL_TASK_ENDPOINT,
      'localTasks.proposals.list',
      { status },
      z.object({ proposals: z.array(proposalSchema) })
    ),
  decide: (proposalId: string, decision: 'confirmed' | 'dismissed', keep?: number[]) =>
    writeLocalTasks(
      SELF_LOCAL_TASK_ENDPOINT,
      'localTasks.proposals.decide',
      { proposalId, decision, ...(keep ? { keepItemIndexes: keep } : {}) },
      proposalResult
    ),
  /** Takes a confirmed proposal for this window to run; only one window's claim succeeds. */
  claim: (proposalId: string) =>
    writeLocalTasks(
      SELF_LOCAL_TASK_ENDPOINT,
      'localTasks.proposals.claim',
      { proposalId },
      proposalResult
    ),
  /** Gives up this window's claim on a run it can no longer report on, so a person can close it out. */
  release: (proposalId: string) =>
    writeLocalTasks(
      SELF_LOCAL_TASK_ENDPOINT,
      'localTasks.proposals.release',
      { proposalId },
      proposalResult
    ),
  recordResults: (proposalId: string, results: LocalTaskProposalItemResult[], finalize = true) =>
    writeLocalTasks(
      SELF_LOCAL_TASK_ENDPOINT,
      'localTasks.proposals.recordResults',
      { proposalId, results, finalize },
      proposalResult
    ),
  watches: (paneKey: string) =>
    callLocalTasks(
      SELF_LOCAL_TASK_ENDPOINT,
      'localTasks.dispatcher.watches',
      { paneKey },
      watchesResult
    ),
  /** Follows, for the dispatcher, a task its ref named in another host's library (REQ-031). */
  watch: (paneKey: string, taskId: string, replacesRef?: string) =>
    writeLocalTasks(
      SELF_LOCAL_TASK_ENDPOINT,
      'localTasks.dispatcher.watch',
      { paneKey, taskId, ...(replacesRef ? { replacesRef } : {}) },
      okResult
    ),
  unwatch: (paneKey: string, taskId: string) =>
    writeLocalTasks(
      SELF_LOCAL_TASK_ENDPOINT,
      'localTasks.dispatcher.unwatch',
      { paneKey, taskId },
      okResult
    ),
  /** Facts this window read in other libraries, for the dispatcher's inbox (REQ-031). */
  recordFacts: (paneKey: string, facts: LocalTaskForwardedFact[]) =>
    writeLocalTasks(
      SELF_LOCAL_TASK_ENDPOINT,
      'localTasks.dispatcher.recordFacts',
      { paneKey, facts },
      okResult
    ),
  inbox: (paneKey: string, limit: number) =>
    callLocalTasks(
      SELF_LOCAL_TASK_ENDPOINT,
      'localTasks.dispatcher.inbox',
      { paneKey, limit },
      inboxResult
    )
}
