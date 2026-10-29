import { beforeEach, describe, expect, it } from 'vitest'
import type {
  LocalTask,
  LocalTaskEvent,
  LocalTaskProject,
  LocalTasksStatus
} from '../../../shared/local-tasks/local-task-types'
import { localTasksDomainStore } from './local-tasks-domain-store'
import { createLocalTasksSync, localTasksPartitionStore } from './local-tasks-sync'

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void }

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

function task(id: string, title: string): LocalTask {
  return {
    id,
    projectId: 'p1',
    number: 1,
    ref: 'SHOP-1',
    title,
    description: '',
    criteria: [],
    statusId: 's1',
    priority: 0,
    labels: [],
    parentId: null,
    createdAt: 1,
    updatedAt: 1,
    revision: 0
  }
}

const READY: LocalTasksStatus = {
  taskHost: true,
  state: 'ready',
  reason: null,
  revision: 3,
  taskHostId: 'host'
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/** Answers for one method, released by the test in whatever order it needs. */
function answers<T>(calls: string[], name: string) {
  const waiting: Deferred<T>[] = []
  return {
    ask: (): Promise<T> => {
      calls.push(name)
      const next = deferred<T>()
      waiting.push(next)
      return next.promise
    },
    release: async (value: T, which: 'first' | 'last' = 'first'): Promise<void> => {
      const next = which === 'first' ? waiting.shift() : waiting.pop()
      next?.resolve(value)
      await flush()
    }
  }
}

// Why answered at once: these tests pin the slice-1 resources; links and progress have their own.
const SLICE_TWO_READS = {
  listLinks: async () => ({ workspaces: [], sessions: [] }),
  getProgress: async () => ({ observedAt: 0, sessions: [], items: [] })
}

function scriptedHost() {
  const calls: string[] = []
  const status = answers<LocalTasksStatus>(calls, 'status')
  const projects = answers<LocalTaskProject[]>(calls, 'projects')
  const tasks = answers<LocalTask[]>(calls, 'tasks')
  const events = answers<LocalTaskEvent[]>(calls, 'events')
  const preferences = answers<Record<string, string | null>>(calls, 'preferences')
  const client = {
    status: status.ask,
    listProjects: projects.ask,
    listTasks: tasks.ask,
    listEvents: () => events.ask(),
    getPreferences: () => preferences.ask(),
    ...SLICE_TWO_READS
  }
  return { client, calls, status, projects, tasks, events, preferences }
}

const own = () => localTasksDomainStore.getState().writer('local')
const ownLibrary = () => localTasksPartitionStore(localTasksDomainStore, 'local')

beforeEach(() => {
  localTasksDomainStore.setState(localTasksDomainStore.getInitialState())
  localTasksDomainStore.getState().openEndpoint('local')
})

describe('createLocalTasksSync', () => {
  it('re-reads status and every scope on ready, because missed notices are never replayed', async () => {
    const host = scriptedHost()
    const sync = createLocalTasksSync(host.client, ownLibrary())
    sync.receive({ type: 'ready', subscriptionId: 'r1', revision: 3, state: 'ready' })
    await host.status.release(READY)
    expect(host.calls).toEqual(['status', 'projects', 'tasks', 'preferences'])
    await host.tasks.release([task('t1', 'Export CSV')])
    await host.projects.release([])
    await host.preferences.release({ taskPageLocalActive: '1' })
    const state = localTasksDomainStore.getState()
    expect(state.connection).toBe('live')
    expect(state.tasks.map((item) => item.title)).toEqual(['Export CSV'])
    expect(state.preferences.taskPageLocalActive).toBe('1')
  })

  it('re-reads only the scopes a change names', async () => {
    const host = scriptedHost()
    const sync = createLocalTasksSync(host.client, ownLibrary())
    own().setHostState('ready', null)
    sync.receive({ type: 'changed', revision: 4, scopes: ['tasks'] })
    expect(host.calls).toEqual(['tasks'])
  })

  it('reads nothing but status while the library is not readable', async () => {
    const host = scriptedHost()
    const sync = createLocalTasksSync(host.client, ownLibrary())
    sync.receive({ type: 'ready', subscriptionId: 'r1', revision: 0, state: 'unavailable' })
    await host.status.release({ ...READY, state: 'unavailable', reason: 'disk full' })
    expect(host.calls).toEqual(['status'])
    expect(localTasksDomainStore.getState().hostReason).toBe('disk full')
  })

  it('keeps the newer read when an older response arrives last', async () => {
    const host = scriptedHost()
    const sync = createLocalTasksSync(host.client, ownLibrary())
    own().setHostState('ready', null)
    sync.receive({ type: 'changed', revision: 4, scopes: ['tasks'] })
    sync.receive({ type: 'changed', revision: 5, scopes: ['tasks'] })
    await host.tasks.release([task('t1', 'newer')], 'last')
    await host.tasks.release([task('t1', 'older')], 'first')
    expect(localTasksDomainStore.getState().tasks.map((item) => item.title)).toEqual(['newer'])
  })

  it('loads activity only for tasks something is showing, and drops it on release', async () => {
    const host = scriptedHost()
    const sync = createLocalTasksSync(host.client, ownLibrary())
    own().setConnection('live')
    own().setHostState('ready', null)
    const release = sync.watchEvents('t1')
    sync.receive({ type: 'changed', revision: 6, scopes: ['events'] })
    expect(host.calls).toEqual(['events', 'events'])
    await host.events.release([])
    await host.events.release([])
    expect(localTasksDomainStore.getState().eventsByTaskId.t1).toEqual([])
    release()
    expect(localTasksDomainStore.getState().eventsByTaskId.t1).toBeUndefined()
  })

  it('keeps the reported project count and asks a library with none nothing about sessions', async () => {
    const asked: string[] = []
    const client = {
      status: async () => ({ ...READY, projectCount: 0 }),
      listProjects: async () => [],
      listTasks: async () => [],
      listEvents: async () => [],
      getPreferences: async () => ({}),
      listLinks: async () => ({ workspaces: [], sessions: [] }),
      getProgress: async () => {
        asked.push('attention')
        return { observedAt: 0, sessions: [], items: [] }
      }
    }
    const sync = createLocalTasksSync(client, ownLibrary())
    await sync.refresh(null)
    expect(asked).toEqual([])
    expect(localTasksDomainStore.getState().partitions[0]?.projectCount).toBe(0)
  })

  it('reads nothing from a library whose Orca is out of contact', async () => {
    const host = scriptedHost()
    localTasksDomainStore.getState().openEndpoint('runtime:env-1')
    localTasksDomainStore.getState().setEndpointContact('runtime:env-1', false)
    const sync = createLocalTasksSync(
      host.client,
      localTasksPartitionStore(localTasksDomainStore, 'runtime:env-1')
    )
    await sync.refresh(null)
    sync.receive({ type: 'changed', revision: 1, scopes: ['tasks', 'attention'] })
    expect(host.calls).toEqual([])
  })

  it('keeps each read failure until that resource succeeds, and retry re-reads it', async () => {
    let failProjects = true
    const client = {
      status: async () => READY,
      listProjects: async () => {
        if (failProjects) {
          throw new Error('projects read failed')
        }
        return []
      },
      listTasks: async () => [],
      listEvents: async () => [],
      getPreferences: async () => ({}),
      ...SLICE_TWO_READS
    }
    own().setHostState('ready', null)
    const sync = createLocalTasksSync(client, ownLibrary())
    await sync.refresh(['projects', 'tasks'])
    expect(localTasksDomainStore.getState()).toMatchObject({
      projectsLoaded: false,
      tasksLoaded: true,
      readErrors: { projects: 'projects read failed' }
    })

    localTasksDomainStore.getState().retry()
    expect(localTasksDomainStore.getState().readErrors.projects).toBe('projects read failed')
    failProjects = false
    await sync.refresh(['projects'])
    expect(localTasksDomainStore.getState()).toMatchObject({
      projectsLoaded: true,
      readErrors: {}
    })
  })
})
