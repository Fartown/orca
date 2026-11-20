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
import {
  LocalTaskDispatcherWorkspaceSchema,
  LOCAL_TASK_DISPATCHER_PANE_PREFERENCE_KEY,
  LOCAL_TASK_DISPATCHER_SESSION_PREFERENCE_KEY
} from '../../../shared/local-tasks/local-task-dispatcher-workspace'
import {
  localTaskClientId,
  localTaskIdEndpoint,
  localTaskOwnerId,
  type LocalTaskEndpointKey
} from './local-task-endpoints'
import { toHostSessionPaneKey } from '../../../shared/workspace-layout/terminal-surface-id'
import { callLocalTasks, writeLocalTasks } from './local-tasks-endpoint-calls'
import {
  dispatcherClientProposal,
  dispatcherClientTaskId,
  dispatcherSourceTaskId,
  dispatcherSourceUnwatchId
} from './local-task-dispatcher-ids'
import { getLocalTaskDispatcherEndpoint } from './local-task-dispatcher-source'

const conversationResult = writeResultSchema({ conversation: conversationSchema })
const proposalResult = writeResultSchema({ proposal: proposalSchema })
const inboxResult = writeResultSchema({ inbox: inboxSchema })
const watchesResult = writeResultSchema({ watches: z.array(watchSchema) })
const okResult = writeResultSchema({})

export function localTaskDispatcherClientFor(endpoint: LocalTaskEndpointKey) {
  const pane = (paneKey: string) => (endpoint === 'local' ? paneKey : toHostSessionPaneKey(paneKey))
  const proposalId = (id: string) => {
    if (localTaskIdEndpoint(id) !== endpoint) {
      throw new Error('The proposal belongs to another task library')
    }
    return localTaskOwnerId(id)
  }
  const proposalWrite = async (
    method: string,
    id: string,
    params: Record<string, unknown> = {}
  ) => {
    const result = await writeLocalTasks(
      endpoint,
      method,
      { proposalId: proposalId(id), ...params },
      proposalResult
    )
    return result.ok
      ? { ...result, proposal: dispatcherClientProposal(endpoint, result.proposal) }
      : result
  }
  return {
    setPreference: (key: string, value: string | null) =>
      callLocalTasks(endpoint, 'localTasks.preferences.set', { key, value }, okResult),
    prepareWorkspace: () =>
      callLocalTasks(
        endpoint,
        'localTasks.dispatcher.prepareWorkspace',
        {},
        writeResultSchema(LocalTaskDispatcherWorkspaceSchema.omit({ ok: true }).shape)
      ),
    readPreferences: async () =>
      (
        await callLocalTasks(
          endpoint,
          'localTasks.preferences.get',
          {
            keys: [
              LOCAL_TASK_DISPATCHER_PANE_PREFERENCE_KEY,
              LOCAL_TASK_DISPATCHER_SESSION_PREFERENCE_KEY,
              'dispatcher.wake'
            ]
          },
          z.object({ values: z.record(z.string(), z.string().nullable()) })
        )
      ).values,
    register: async (
      paneKey: string,
      agent: string,
      previousPaneKey?: string | null,
      worktreeId?: string
    ) => {
      const result = await writeLocalTasks(
        endpoint,
        'localTasks.dispatcher.register',
        {
          paneKey: pane(paneKey),
          agent,
          ...(previousPaneKey ? { previousPaneKey: pane(previousPaneKey) } : {}),
          ...(worktreeId ? { worktreeId } : {})
        },
        conversationResult
      )
      return result.ok
        ? {
            ...result,
            conversation: {
              ...result.conversation,
              id: localTaskClientId(endpoint, result.conversation.id)
            }
          }
        : result
    },
    list: async (status: 'pending' | 'confirmed' | 'executing' | 'executed') => {
      const result = await callLocalTasks(
        endpoint,
        'localTasks.proposals.list',
        { status },
        z.object({ proposals: z.array(proposalSchema) })
      )
      return {
        proposals: result.proposals.map((proposal) => dispatcherClientProposal(endpoint, proposal))
      }
    },
    decide: (id: string, decision: 'confirmed' | 'dismissed', keep?: number[]) =>
      proposalWrite('localTasks.proposals.decide', id, {
        decision,
        ...(keep ? { keepItemIndexes: keep } : {})
      }),
    claim: (id: string) => proposalWrite('localTasks.proposals.claim', id),
    release: (id: string) => proposalWrite('localTasks.proposals.release', id),
    recordResults: (id: string, results: LocalTaskProposalItemResult[], finalize = true) =>
      proposalWrite('localTasks.proposals.recordResults', id, {
        results: results.map((result) => ({
          ...result,
          ...(result.taskId ? { taskId: dispatcherSourceTaskId(endpoint, result.taskId) } : {})
        })),
        finalize
      }),
    watches: async (paneKey: string) => {
      const result = await callLocalTasks(
        endpoint,
        'localTasks.dispatcher.watches',
        { paneKey: pane(paneKey) },
        watchesResult
      )
      return result.ok
        ? {
            ...result,
            watches: result.watches.map((watch) => ({
              ...watch,
              taskId: dispatcherClientTaskId(endpoint, watch.taskId)
            }))
          }
        : result
    },
    watch: (paneKey: string, taskId: string, replacesRef?: string) =>
      writeLocalTasks(
        endpoint,
        'localTasks.dispatcher.watch',
        {
          paneKey: pane(paneKey),
          taskId: dispatcherSourceTaskId(endpoint, taskId),
          ...(replacesRef ? { replacesRef } : {})
        },
        okResult
      ),
    unwatch: (paneKey: string, taskId: string) =>
      writeLocalTasks(
        endpoint,
        'localTasks.dispatcher.unwatch',
        { paneKey: pane(paneKey), taskId: dispatcherSourceUnwatchId(endpoint, taskId) },
        okResult
      ),
    recordFacts: (paneKey: string, facts: LocalTaskForwardedFact[]) =>
      writeLocalTasks(
        endpoint,
        'localTasks.dispatcher.recordFacts',
        {
          paneKey: pane(paneKey),
          facts: facts.map((fact) => ({
            ...fact,
            taskId: fact.taskId ? dispatcherSourceTaskId(endpoint, fact.taskId) : null
          }))
        },
        okResult
      ),
    inbox: async (paneKey: string, limit: number) => {
      const result = await callLocalTasks(
        endpoint,
        'localTasks.dispatcher.inbox',
        { paneKey: pane(paneKey), limit },
        inboxResult
      )
      return result.ok
        ? {
            ...result,
            inbox: {
              ...result.inbox,
              conversationId: localTaskClientId(endpoint, result.inbox.conversationId),
              items: result.inbox.items.map((item) => ({
                ...item,
                taskId: item.taskId ? dispatcherClientTaskId(endpoint, item.taskId) : null
              }))
            }
          }
        : result
    }
  }
}

const selected = () => localTaskDispatcherClientFor(getLocalTaskDispatcherEndpoint())
export const localTaskDispatcherClient = {
  setPreference: (key: string, value: string | null) => selected().setPreference(key, value),
  prepareWorkspace: () => selected().prepareWorkspace(),
  readPreferences: () => selected().readPreferences(),
  register: (...args: Parameters<ReturnType<typeof selected>['register']>) =>
    selected().register(...args),
  list: (...args: Parameters<ReturnType<typeof selected>['list']>) => selected().list(...args),
  watches: (...args: Parameters<ReturnType<typeof selected>['watches']>) =>
    selected().watches(...args),
  watch: (...args: Parameters<ReturnType<typeof selected>['watch']>) => selected().watch(...args),
  unwatch: (...args: Parameters<ReturnType<typeof selected>['unwatch']>) =>
    selected().unwatch(...args),
  recordFacts: (...args: Parameters<ReturnType<typeof selected>['recordFacts']>) =>
    selected().recordFacts(...args),
  inbox: (...args: Parameters<ReturnType<typeof selected>['inbox']>) => selected().inbox(...args),
  decide: (id: string, ...args: [decision: 'confirmed' | 'dismissed', keep?: number[]]) =>
    localTaskDispatcherClientFor(localTaskIdEndpoint(id)).decide(id, ...args),
  claim: (id: string) => localTaskDispatcherClientFor(localTaskIdEndpoint(id)).claim(id),
  release: (id: string) => localTaskDispatcherClientFor(localTaskIdEndpoint(id)).release(id),
  recordResults: (
    id: string,
    ...args: [results: LocalTaskProposalItemResult[], finalize?: boolean]
  ) => localTaskDispatcherClientFor(localTaskIdEndpoint(id)).recordResults(id, ...args)
}
