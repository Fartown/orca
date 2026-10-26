import { describe, expect, it } from 'vitest'
import { runRpcOperation } from '../transport/rpc-operation'
import { RpcIncompatibleReplyError } from '../transport/rpc-incompatible-reply-error'
import type { RpcResponse } from '../transport/types'
import {
  localTaskCreate,
  localTaskProjectsRead,
  localTaskEventsRead,
  localTasksListRead
} from './local-tasks-operations'

function portAnswering(result: unknown) {
  const sent: { method: string; params: unknown }[] = []
  return {
    sent,
    port: {
      sendRequest: (method: string, params?: unknown): Promise<RpcResponse> => {
        sent.push({ method, params })
        return Promise.resolve({ id: 'r1', ok: true, result })
      }
    }
  }
}

const task = {
  id: 't1',
  projectId: 'p1',
  number: 12,
  ref: 'SHOP-12',
  title: 'Export CSV',
  description: '',
  criteria: [],
  statusId: 's-started',
  priority: 2,
  labels: ['feature'],
  parentId: null,
  createdAt: 1,
  updatedAt: 2,
  revision: 0
}

const project = {
  id: 'p1',
  name: 'Shop',
  prefix: 'SHOP',
  aliases: ['MALL'],
  orcaProjectId: 'orca-1',
  defaultRepoId: null,
  lastExecutionHostId: null,
  rules: { startMovesToInProgress: true, prMergedCompletes: false },
  statuses: [
    {
      id: 's-started',
      projectId: 'p1',
      category: 'started',
      name: 'In Progress',
      color: 'yellow',
      position: 0
    }
  ],
  createdAt: 1,
  updatedAt: 1,
  revision: 3
}

describe('local task reply readers', () => {
  it('drops only the rows a newer desktop wrote in a shape this build cannot place', async () => {
    const { port } = portAnswering({
      tasks: [task, { ...task, id: undefined }, { ...task, id: 't2', priority: 9, labels: 'oops' }]
    })
    const tasks = await runRpcOperation(port, localTasksListRead, {})
    expect(tasks.map((entry) => entry.id)).toEqual(['t1', 't2'])
    // A field it cannot read falls back instead of costing the task.
    expect(tasks[1]).toMatchObject({ priority: 0, labels: [] })
  })

  it('keeps a project whose new status category or color it does not know', async () => {
    const { port } = portAnswering({
      projects: [
        {
          ...project,
          statuses: [
            ...project.statuses,
            {
              id: 's-x',
              projectId: 'p1',
              category: 'triage',
              name: 'Triage',
              color: 'gray',
              position: 0
            },
            {
              id: 's-y',
              projectId: 'p1',
              category: 'review',
              name: 'QA',
              color: 'teal',
              position: 1
            }
          ]
        }
      ]
    })
    const [read] = await runRpcOperation(port, localTaskProjectsRead)
    expect(read?.statuses.map((status) => [status.id, status.color])).toEqual([
      ['s-started', 'yellow'],
      ['s-y', 'gray']
    ])
    expect(read?.aliases).toEqual(['MALL'])
  })

  it('drops an activity kind it cannot describe and keeps an unknown source as other', async () => {
    const event = {
      id: 'e1',
      taskId: 't1',
      kind: 'comment',
      source: 'mobile',
      body: 'hi',
      payload: null,
      createdAt: 1,
      editedAt: null
    }
    const { port } = portAnswering({
      events: [
        event,
        { ...event, id: 'e2', kind: 'workspace-linked' },
        { ...event, id: 'e3', source: 'robot' }
      ]
    })
    const events = await runRpcOperation(port, localTaskEventsRead, { taskId: 't1' })
    expect(events.map((entry) => [entry.id, entry.source])).toEqual([
      ['e1', 'mobile'],
      ['e3', 'cli']
    ])
  })

  it('reads a business refusal as a value, including a code this build has no copy for', async () => {
    const known = portAnswering({ ok: false, code: 'prefix_taken', detail: 'Mall' })
    const params = { clientOperationId: 'op-1', projectId: 'p1', title: 'x' }
    await expect(runRpcOperation(known.port, localTaskCreate, params)).resolves.toEqual({
      ok: false,
      code: 'prefix_taken',
      detail: 'Mall'
    })
    const future = portAnswering({ ok: false, code: 'quota_exceeded' })
    await expect(runRpcOperation(future.port, localTaskCreate, params)).resolves.toEqual({
      ok: false,
      code: 'quota_exceeded',
      detail: null
    })
  })

  it('throws on a reply that is not a task library answer at all', async () => {
    const { port } = portAnswering({ items: [] })
    await expect(runRpcOperation(port, localTasksListRead, {})).rejects.toBeInstanceOf(
      RpcIncompatibleReplyError
    )
  })
})
