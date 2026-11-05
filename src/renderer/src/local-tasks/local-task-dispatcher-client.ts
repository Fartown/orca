import { z } from 'zod'
import {
  conversationSchema,
  inboxSchema,
  proposalSchema
} from '../../../shared/local-tasks/local-task-dispatcher-schemas'
import type { LocalTaskProposalItemResult } from '../../../shared/local-tasks/local-task-dispatcher-types'
import { writeResultSchema } from '../../../shared/local-tasks/local-task-result-schemas'
import { SELF_LOCAL_TASK_ENDPOINT } from './local-task-endpoints'
import { callLocalTasks, writeLocalTasks } from './local-tasks-endpoint-calls'

// Why only this window's own library: the dispatcher runs in its floating workspace (REQ-030).
const conversationResult = writeResultSchema({ conversation: conversationSchema })
const proposalResult = writeResultSchema({ proposal: proposalSchema })
const inboxResult = writeResultSchema({ inbox: inboxSchema })

export const localTaskDispatcherClient = {
  register: (paneKey: string, agent: string, previousPaneKey?: string | null) =>
    writeLocalTasks(
      SELF_LOCAL_TASK_ENDPOINT,
      'localTasks.dispatcher.register',
      { paneKey, agent, ...(previousPaneKey ? { previousPaneKey } : {}) },
      conversationResult
    ),
  list: (status: 'pending' | 'confirmed') =>
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
  recordResults: (proposalId: string, results: LocalTaskProposalItemResult[]) =>
    writeLocalTasks(
      SELF_LOCAL_TASK_ENDPOINT,
      'localTasks.proposals.recordResults',
      { proposalId, results },
      proposalResult
    ),
  inbox: (paneKey: string, limit: number) =>
    callLocalTasks(
      SELF_LOCAL_TASK_ENDPOINT,
      'localTasks.dispatcher.inbox',
      { paneKey, limit },
      inboxResult
    )
}
