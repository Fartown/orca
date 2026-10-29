import { describe, expect, it, vi } from 'vitest'
import { LOCAL_TASKS_RUNTIME_CAPABILITY } from '../../../src/shared/local-tasks/local-tasks-capability'
import type { RpcResponse } from '../transport/types'
import { createLocalTasksApi } from './local-tasks-api'
import { readLocalTasksInProgress } from './local-task-home-attention'
import { resolveLocalTasksAccess } from './local-tasks-access'

const connected = { connState: 'connected' as const, statusPending: false, statusReadable: true }

describe('which hosts the phone treats as task hosts', () => {
  it('opens the library only for a connected host that advertised local-tasks.v1', () => {
    expect(
      resolveLocalTasksAccess({ ...connected, capabilities: [LOCAL_TASKS_RUNTIME_CAPABILITY] })
    ).toBe('ready')
    // An older Orca: no capability, so no task entry and no request.
    expect(resolveLocalTasksAccess({ ...connected, capabilities: ['mobile.tasks.v1'] })).toBe(
      'unsupported'
    )
    // A status nobody could read is "cannot tell", never "too old".
    expect(resolveLocalTasksAccess({ ...connected, statusReadable: false, capabilities: [] })).toBe(
      'unreadable'
    )
    expect(resolveLocalTasksAccess({ ...connected, statusPending: true, capabilities: [] })).toBe(
      'checking'
    )
  })

  it('calls a host out of contact not open, even one that advertised before', () => {
    for (const connState of ['disconnected', 'reconnecting', 'auth-failed'] as const) {
      expect(
        resolveLocalTasksAccess({
          ...connected,
          connState,
          capabilities: [LOCAL_TASKS_RUNTIME_CAPABILITY]
        })
      ).toBe('offline')
    }
  })

  it('counts Started tasks, subtasks included, on a host that has it', async () => {
    const statuses = [
      {
        id: 'todo',
        projectId: 'p',
        category: 'unstarted',
        name: 'Todo',
        color: 'gray',
        position: 0
      },
      {
        id: 'doing',
        projectId: 'p',
        category: 'started',
        name: 'Doing',
        color: 'yellow',
        position: 0
      }
    ]
    const project = {
      id: 'p',
      name: 'P',
      prefix: 'P',
      aliases: [],
      repos: [],
      defaultRepoId: null,
      lastExecutionHostId: null,
      rules: { startMovesToInProgress: true, prMergedCompletes: true },
      statuses,
      createdAt: 0,
      updatedAt: 0,
      revision: 0
    }
    const task = (id: string, statusId: string, parentId: string | null = null) => ({
      id,
      projectId: 'p',
      number: 1,
      ref: `P-${id}`,
      title: id,
      description: '',
      criteria: [],
      statusId,
      priority: 0,
      labels: [],
      parentId,
      createdAt: 0,
      updatedAt: 0,
      revision: 0
    })
    const replies: Record<string, unknown> = {
      'localTasks.status': {
        taskHost: true,
        state: 'ready',
        revision: 1,
        reason: null,
        taskHostId: 'h'
      },
      'localTasks.projects.list': { projects: [project] },
      'localTasks.tasks.list': {
        tasks: [task('a', 'doing'), task('b', 'doing', 'a'), task('c', 'todo')]
      }
    }
    const sendRequest = vi.fn((method: string) =>
      Promise.resolve<RpcResponse>({ id: method, ok: true, result: replies[method] })
    )
    await expect(readLocalTasksInProgress(createLocalTasksApi({ sendRequest }))).resolves.toBe(2)
    expect(sendRequest.mock.calls.map(([method]) => method).sort()).toEqual([
      'localTasks.projects.list',
      'localTasks.status',
      'localTasks.tasks.list'
    ])
  })

  it('uses the optional host count without downloading the library', async () => {
    const sendRequest = vi.fn(async (_method: string) => ({
      id: 'status',
      ok: true as const,
      result: {
        taskHost: true,
        state: 'ready',
        revision: 1,
        reason: null,
        taskHostId: 'h',
        inProgressCount: 4
      }
    }))
    await expect(readLocalTasksInProgress(createLocalTasksApi({ sendRequest }))).resolves.toBe(4)
    expect(sendRequest).toHaveBeenCalledOnce()
    expect(sendRequest.mock.calls[0]?.[0]).toBe('localTasks.status')
  })
})
