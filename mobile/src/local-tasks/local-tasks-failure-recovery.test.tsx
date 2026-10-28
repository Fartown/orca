import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import type { RpcClient } from '../transport/rpc-client'
import type { RpcResponse } from '../transport/types'
import { createLocalTasksApi, type LocalTasksApi } from './local-tasks-api'
import { initialLocalTaskDraft } from './local-task-form-state'
import { localTasksCopyFor } from './local-tasks-copy'
import { localTasksScreenState } from './local-tasks-screen-state'
import { useLocalTaskFormSubmit } from './use-local-task-form-submit'
import { useLocalTasksLibrary, type LocalTasksLibrary } from './use-local-tasks-library'

vi.mock('react-native', () => ({ AppState: { addEventListener: () => ({ remove: () => {} }) } }))
vi.mock('./local-tasks-change-feed', () => ({ startLocalTasksChangeFeed: () => () => {} }))

function testApi(overrides: Partial<LocalTasksApi>): LocalTasksApi {
  const base = createLocalTasksApi({
    sendRequest: async () => {
      throw new Error('unexpected RPC')
    }
  })
  return { ...base, ...overrides }
}

function testLibrary(overrides: Partial<LocalTasksLibrary>): LocalTasksLibrary {
  return {
    api: null,
    status: null,
    projects: [],
    tasks: [],
    loaded: true,
    error: null,
    eventsVersion: 0,
    live: true,
    streamEnded: false,
    retryFailed: vi.fn(),
    resubscribe: vi.fn(),
    reload: vi.fn(),
    acceptTasks: vi.fn(),
    work: { links: { workspaces: [], sessions: [] }, progress: null, error: null },
    ...overrides
  }
}

const task = (id: string): LocalTask => ({
  id,
  projectId: 'p',
  number: 1,
  ref: `P-${id}`,
  title: id,
  description: '',
  criteria: [],
  statusId: 's',
  priority: 0,
  labels: [],
  parentId: id === 'parent' ? null : 'parent',
  createdAt: 0,
  updatedAt: 0,
  revision: 0
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

describe('mobile task failure recovery', () => {
  let renderer: ReactTestRenderer | null = null
  afterEach(async () => {
    await act(async () => renderer?.unmount())
    renderer = null
  })

  it('keeps a loaded library mounted and read-only while the host reconnects', () => {
    const state = localTasksScreenState(localTasksCopyFor('en'), {
      access: 'checking',
      machineName: 'desk',
      status: null,
      ready: false,
      loaded: true,
      error: null
    })
    expect(state).toMatchObject({ kind: 'library', readOnly: true })
  })

  it('uses the moved task as the next save base when update fails', async () => {
    const original = task('moving')
    const moved = { ...original, projectId: 'other', revision: 1 }
    const moveTask = vi.fn<LocalTasksApi['moveTask']>(async () => ({
      kind: 'ok',
      value: { ok: true, task: moved }
    }))
    const updateTask = vi
      .fn<LocalTasksApi['updateTask']>()
      .mockResolvedValueOnce({ kind: 'refused', code: 'status_invalid', detail: null })
      .mockResolvedValue({ kind: 'ok', value: { ok: true, task: { ...moved, title: 'edited' } } })
    const library = testLibrary({ tasks: [original] })
    const draft = {
      ...initialLocalTaskDraft({ kind: 'edit', task: original }),
      projectId: 'other',
      title: 'edited'
    }
    let model: ReturnType<typeof useLocalTaskFormSubmit> | undefined
    function Probe() {
      model = useLocalTaskFormSubmit(testApi({ moveTask, updateTask }), library)
      return null
    }
    await act(async () => {
      renderer = create(createElement(Probe))
    })
    await act(async () => {
      expect(await model?.save({ kind: 'edit', task: original }, draft)).toBeNull()
    })
    await act(async () => {
      expect(await model?.save({ kind: 'edit', task: original }, draft)).toBe(original.id)
    })
    expect(moveTask).toHaveBeenCalledOnce()
    expect(updateTask).toHaveBeenNthCalledWith(2, expect.objectContaining({ expectedRevision: 1 }))
  })

  it('keeps the failed projects read visible after tasks succeed, then recovers by explicit retry', async () => {
    const projects = deferred<RpcResponse>()
    const tasks = deferred<RpcResponse>()
    let projectReads = 0
    let taskReads = 0
    const sendRequest = vi.fn((method: string): Promise<RpcResponse> => {
      if (method === 'localTasks.status') {
        return Promise.resolve({
          id: 'status',
          ok: true,
          result: { taskHost: true, state: 'ready', revision: 1, reason: null, taskHostId: 'h' }
        })
      }
      if (method === 'localTasks.projects.list') {
        projectReads += 1
        return projectReads === 1
          ? projects.promise
          : Promise.resolve({
              id: 'projects',
              ok: true,
              result: { projects: [] }
            })
      }
      if (method === 'localTasks.tasks.list') {
        taskReads += 1
        return taskReads === 1
          ? tasks.promise
          : Promise.resolve({
              id: 'tasks',
              ok: true,
              result: { tasks: [] }
            })
      }
      throw new Error(`unexpected ${method}`)
    })
    const client: RpcClient = {
      sendRequest,
      subscribe: () => () => {},
      updateTerminalSubscriptionViewport: () => {},
      getState: () => 'connected',
      getReconnectAttempt: () => 0,
      getLastConnectedAt: () => null,
      onStateChange: () => () => {},
      notifyForeground: () => {},
      close: () => {}
    }
    let model: LocalTasksLibrary | undefined
    function Probe() {
      model = useLocalTasksLibrary(client, true)
      return null
    }
    await act(async () => {
      renderer = create(createElement(Probe))
    })
    await act(async () => model?.reload())
    await act(async () => projects.reject(new Error('project read failed')))
    await act(async () => tasks.resolve({ id: 'tasks', ok: true, result: { tasks: [] } }))
    expect(model?.error).toBe('project read failed')
    expect(model?.loaded).toBe(false)
    expect(
      localTasksScreenState(localTasksCopyFor('en'), {
        access: 'ready',
        machineName: 'desk',
        status: model?.status ?? null,
        ready: true,
        loaded: model?.loaded ?? false,
        error: model?.error ?? null
      })
    ).toMatchObject({ kind: 'gate', retry: true })
    await act(async () => model?.reload(['projects']))
    expect(model?.error).toBeNull()
    expect(model?.loaded).toBe(true)
    expect(projectReads).toBe(2)
  })

  it('keeps a loaded library when a later resource refresh fails', async () => {
    let projectsReads = 0
    const client: RpcClient = {
      sendRequest: async (method) => {
        if (method === 'localTasks.status') {
          return {
            id: method,
            ok: true,
            result: { taskHost: true, state: 'ready', revision: 1, reason: null, taskHostId: 'h' }
          }
        }
        if (method === 'localTasks.projects.list') {
          projectsReads += 1
          if (projectsReads === 2) {
            throw new Error('later failure')
          }
          return { id: method, ok: true, result: { projects: [] } }
        }
        if (method === 'localTasks.tasks.list') {
          return { id: method, ok: true, result: { tasks: [] } }
        }
        throw new Error(`unexpected ${method}`)
      },
      subscribe: () => () => {},
      updateTerminalSubscriptionViewport: () => {},
      getState: () => 'connected',
      getReconnectAttempt: () => 0,
      getLastConnectedAt: () => null,
      onStateChange: () => () => {},
      notifyForeground: () => {},
      close: () => {}
    }
    let model: LocalTasksLibrary | undefined
    function Probe() {
      model = useLocalTasksLibrary(client, true)
      return null
    }
    await act(async () => {
      renderer = create(createElement(Probe))
    })
    await act(async () => model?.reload())
    expect(model?.loaded).toBe(true)
    await act(async () => model?.reload(['projects']))
    expect(model?.loaded).toBe(true)
    expect(model?.projects).toEqual([])
    expect(model?.error).toBe('later failure')
    expect(
      localTasksScreenState(localTasksCopyFor('en'), {
        access: 'ready',
        machineName: 'desk',
        status: model?.status ?? null,
        ready: true,
        loaded: model?.loaded ?? false,
        error: model?.error ?? null
      })
    ).toMatchObject({ kind: 'library', notice: localTasksCopyFor('en').loadFailed })
  })

  it('writes all pasted subtask properties and retries a failed second step without creating again', async () => {
    const parent = task('parent')
    const child = task('child')
    const createSubtasks = vi.fn<LocalTasksApi['createSubtasks']>(async () => ({
      kind: 'ok',
      value: { ok: true, tasks: [child] }
    }))
    const batchUpdate = vi
      .fn<LocalTasksApi['batchUpdate']>()
      .mockResolvedValueOnce({ kind: 'refused', code: 'status_invalid', detail: null })
      .mockResolvedValue({ kind: 'ok', value: { ok: true } })
    const updateTask = vi.fn<LocalTasksApi['updateTask']>(async () => ({
      kind: 'ok',
      value: { ok: true, task: child }
    }))
    const library = testLibrary({ acceptTasks: vi.fn(), reload: vi.fn(), tasks: [parent] })
    const draft = {
      ...initialLocalTaskDraft({ kind: 'subtask' as const, parent }),
      criteria: [{ id: 'c', text: 'passes review' }],
      labelsText: 'frontend',
      statusId: 'chosen',
      priority: 2 as const
    }
    let model: ReturnType<typeof useLocalTaskFormSubmit> | undefined
    function Probe() {
      model = useLocalTaskFormSubmit(testApi({ createSubtasks, batchUpdate, updateTask }), library)
      return null
    }
    await act(async () => {
      renderer = create(createElement(Probe))
    })
    let first: boolean | undefined
    await act(async () => {
      first = await model?.createSubtasks(parent, ['one', 'two'], draft)
    })
    expect(first).toBe(false)
    expect(model?.partialTaskId).toBe('parent')
    expect(model?.error).toContain(localTasksCopyFor('en').subtasksPartiallySaved)
    expect(updateTask).not.toHaveBeenCalled()
    let second: boolean | undefined
    await act(async () => {
      second = await model?.retrySubtasks(parent, draft)
    })
    expect(second).toBe(true)
    expect(createSubtasks).toHaveBeenCalledTimes(1)
    expect(batchUpdate).toHaveBeenCalledTimes(2)
    expect(batchUpdate.mock.calls[1]?.[0]).toMatchObject({
      taskIds: ['child'],
      patch: { statusId: 'chosen', priority: 2, addLabels: ['frontend'] }
    })
    expect(updateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'child',
        patch: { criteria: ['passes review'] }
      })
    )
    expect(model?.partialTaskId).toBeNull()
  })

  it('applies edited fields to the same children after a later criterion fails', async () => {
    const parent = task('parent')
    const children = [task('first'), task('second')]
    const createSubtasks = vi.fn<LocalTasksApi['createSubtasks']>(async () => ({
      kind: 'ok',
      value: { ok: true, tasks: children }
    }))
    const batchUpdate = vi.fn<LocalTasksApi['batchUpdate']>(async () => ({
      kind: 'ok',
      value: { ok: true }
    }))
    const updateTask = vi
      .fn<LocalTasksApi['updateTask']>()
      .mockResolvedValueOnce({ kind: 'ok', value: { ok: true, task: children[0] } })
      .mockResolvedValueOnce({ kind: 'refused', code: 'stale', detail: null })
      .mockResolvedValue({ kind: 'ok', value: { ok: true, task: children[0] } })
    const library = testLibrary({ acceptTasks: vi.fn(), reload: vi.fn(), tasks: [parent] })
    let model: ReturnType<typeof useLocalTaskFormSubmit> | undefined
    function Probe() {
      model = useLocalTaskFormSubmit(testApi({ createSubtasks, batchUpdate, updateTask }), library)
      return null
    }
    const base = initialLocalTaskDraft({ kind: 'subtask', parent })
    const firstDraft = {
      ...base,
      priority: 2 as const,
      labelsText: 'old',
      criteria: [{ id: 'c', text: 'old criterion' }]
    }
    const revised = {
      ...base,
      priority: 0 as const,
      labelsText: 'new',
      criteria: [{ id: 'c', text: 'new criterion' }]
    }
    await act(async () => {
      renderer = create(createElement(Probe))
    })
    await act(async () => {
      expect(await model?.createSubtasks(parent, ['one', 'two'], firstDraft)).toBe(false)
    })
    await act(async () => {
      expect(await model?.retrySubtasks(parent, revised)).toBe(true)
    })
    expect(createSubtasks).toHaveBeenCalledOnce()
    expect(batchUpdate).toHaveBeenCalledTimes(2)
    expect(batchUpdate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        patch: expect.objectContaining({
          priority: 0,
          addLabels: ['new'],
          removeLabels: ['old']
        })
      })
    )
    expect(updateTask.mock.calls.slice(2).map((call) => call[0])).toEqual([
      expect.objectContaining({ taskId: 'first', patch: { criteria: ['new criterion'] } }),
      expect.objectContaining({ taskId: 'second', patch: { criteria: ['new criterion'] } })
    ])
  })

  it('retains the multi-line intent and operation id when the create reply is unknown', async () => {
    const parent = task('parent')
    const child = task('child')
    const createSubtasks = vi
      .fn<LocalTasksApi['createSubtasks']>()
      .mockResolvedValueOnce({ kind: 'unknown' })
      .mockResolvedValueOnce({ kind: 'ok', value: { ok: true, tasks: [child] } })
    const library = testLibrary({ acceptTasks: vi.fn(), reload: vi.fn(), tasks: [parent] })
    let model: ReturnType<typeof useLocalTaskFormSubmit> | undefined
    function Probe() {
      model = useLocalTaskFormSubmit(testApi({ createSubtasks }), library)
      return null
    }
    const draft = initialLocalTaskDraft({ kind: 'subtask', parent })
    await act(async () => {
      renderer = create(createElement(Probe))
    })
    await act(async () => {
      expect(await model?.createSubtasks(parent, ['one'], draft)).toBe(false)
    })
    expect(model?.subtaskRetryPending).toBe(true)
    expect(model?.partialTaskId).toBeNull()
    await act(async () => {
      expect(await model?.retrySubtasks(parent, draft)).toBe(true)
    })
    expect(createSubtasks).toHaveBeenCalledTimes(2)
    expect(createSubtasks.mock.calls[1]?.[0].clientOperationId).toBe(
      createSubtasks.mock.calls[0]?.[0].clientOperationId
    )
    expect(model?.subtaskRetryPending).toBe(false)
  })

  it('settles an unknown old-label write before applying changed labels to the same children', async () => {
    const parent = task('parent')
    const child = task('child')
    const createSubtasks = vi.fn<LocalTasksApi['createSubtasks']>(async () => ({
      kind: 'ok',
      value: { ok: true, tasks: [child] }
    }))
    const batchUpdate = vi
      .fn<LocalTasksApi['batchUpdate']>()
      .mockResolvedValueOnce({ kind: 'unknown' })
      .mockResolvedValue({ kind: 'ok', value: { ok: true } })
    const library = testLibrary({ acceptTasks: vi.fn(), reload: vi.fn(), tasks: [parent] })
    let model: ReturnType<typeof useLocalTaskFormSubmit> | undefined
    function Probe() {
      model = useLocalTaskFormSubmit(testApi({ createSubtasks, batchUpdate }), library)
      return null
    }
    const base = initialLocalTaskDraft({ kind: 'subtask', parent })
    await act(async () => {
      renderer = create(createElement(Probe))
    })
    await act(async () => {
      expect(await model?.createSubtasks(parent, ['one'], { ...base, labelsText: 'old' })).toBe(
        false
      )
    })
    await act(async () => {
      expect(await model?.retrySubtasks(parent, { ...base, labelsText: 'new' })).toBe(true)
    })
    expect(createSubtasks).toHaveBeenCalledOnce()
    expect(batchUpdate).toHaveBeenCalledTimes(3)
    expect(batchUpdate.mock.calls[1]?.[0].clientOperationId).toBe(
      batchUpdate.mock.calls[0]?.[0].clientOperationId
    )
    expect(batchUpdate).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        patch: expect.objectContaining({ addLabels: ['new'], removeLabels: ['old'] })
      })
    )
    expect(batchUpdate.mock.calls[2]?.[0].clientOperationId).not.toBe(
      batchUpdate.mock.calls[0]?.[0].clientOperationId
    )
  })

  it('settles an unknown criterion write before applying a changed criterion', async () => {
    const parent = task('parent')
    const child = task('child')
    const createSubtasks = vi.fn<LocalTasksApi['createSubtasks']>(async () => ({
      kind: 'ok',
      value: { ok: true, tasks: [child] }
    }))
    const updateTask = vi
      .fn<LocalTasksApi['updateTask']>()
      .mockResolvedValueOnce({ kind: 'unknown' })
      .mockResolvedValue({ kind: 'ok', value: { ok: true, task: child } })
    const library = testLibrary({ acceptTasks: vi.fn(), reload: vi.fn(), tasks: [parent] })
    let model: ReturnType<typeof useLocalTaskFormSubmit> | undefined
    function Probe() {
      model = useLocalTaskFormSubmit(testApi({ createSubtasks, updateTask }), library)
      return null
    }
    const base = initialLocalTaskDraft({ kind: 'subtask', parent })
    await act(async () => {
      renderer = create(createElement(Probe))
    })
    await act(async () => {
      expect(
        await model?.createSubtasks(parent, ['one'], {
          ...base,
          criteria: [{ id: 'c', text: 'old' }]
        })
      ).toBe(false)
    })
    await act(async () => {
      expect(
        await model?.retrySubtasks(parent, {
          ...base,
          criteria: [{ id: 'c', text: 'new' }]
        })
      ).toBe(true)
    })
    expect(createSubtasks).toHaveBeenCalledOnce()
    expect(updateTask).toHaveBeenCalledTimes(3)
    expect(updateTask.mock.calls[1]?.[0].clientOperationId).toBe(
      updateTask.mock.calls[0]?.[0].clientOperationId
    )
    expect(updateTask).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ patch: { criteria: ['new'] } })
    )
  })
})
