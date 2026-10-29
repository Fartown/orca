import type { LocalTaskStatusRow } from '../../shared/local-tasks/local-task-attention-rules'
import type { LocalTaskChangeScope } from '../../shared/local-tasks/local-task-types'
import type { LocalTaskHostSessionSource } from './local-task-host-session-source'
import { LocalTasksDatabase } from './local-tasks-database'
import { LocalTasksService } from './local-tasks-service'

let opId = 0
export const op = (): string => `op-${++opId}`
export const HOST = 'local'
export const SHOP = 'repo-shop::/Users/me/shop'
export const LEAF = '11111111-1111-4111-8111-111111111111'
export const NOW = 1_000_000

const disposers: (() => void)[] = []

/** Call from `afterEach`: stops every service `setup` started. */
export function disposeLocalTaskExecutionFixtures(): void {
  for (const dispose of disposers.splice(0)) {
    dispose()
  }
}

/** This host's agent status, as the binding hands it to the library. */
export function fakeHost() {
  const rows = new Map<string, LocalTaskStatusRow>()
  const live = new Set<string>()
  const contact = new Set([HOST])
  let listener: (() => void) | null = null
  const source: LocalTaskHostSessionSource = {
    rowsForPane: (paneKey) => {
      const row = rows.get(paneKey)
      return row ? [row] : []
    },
    paneKeys: () => [...rows.keys()],
    terminalLive: (paneKey) => live.has(paneKey),
    inContact: (hostId) => contact.has(hostId),
    subscribe: (onChange) => {
      listener = onChange
      return () => {
        listener = null
      }
    }
  }
  const report = (paneKey: string, row: Partial<LocalTaskStatusRow>): void => {
    rows.set(paneKey, {
      paneKey,
      state: 'working',
      stateStartedAt: NOW - 10,
      receivedAt: NOW - 10,
      ...row
    })
    listener?.()
  }
  return {
    source,
    rows,
    live,
    contact,
    report,
    emit: () => listener?.(),
    watched: () => listener !== null
  }
}

export function setup(options: { clock?: () => number; host?: ReturnType<typeof fakeHost> } = {}) {
  const db = LocalTasksDatabase.openTransient()
  const volatile: LocalTaskChangeScope[][] = []
  const host = options.host ?? fakeHost()
  const service = new LocalTasksService(
    db,
    options.clock ?? (() => NOW),
    (scopes) => volatile.push(scopes),
    host.source
  )
  disposers.push(() => service.execution.dispose())
  const created = service.createProject({
    clientOperationId: op(),
    name: '商城',
    prefix: 'SHOP',
    repos: ['orca-project-shop']
  })
  if (!created.ok) {
    throw new Error(created.code)
  }
  const project = created.project
  const status = (category: string) =>
    project.statuses.find((candidate) => candidate.category === category)?.id ?? ''
  const task = (title: string, parentId?: string) => {
    const result = service.createTask(
      { clientOperationId: op(), projectId: project.id, title, parentId },
      'desktop'
    )
    if (!result.ok) {
      throw new Error(result.code)
    }
    return result.task
  }
  const statusOf = (taskId: string) =>
    service.listTasks().tasks.find((candidate) => candidate.id === taskId)?.statusId
  return { db, service, work: service.execution, project, status, task, statusOf, volatile, host }
}

export function linkWorktree(
  work: LocalTasksService['execution'],
  taskId: string,
  worktreeId: string,
  extra: { replace?: boolean; instanceId?: string; hostId?: string } = {}
) {
  return work.linkWorkspace(
    {
      clientOperationId: op(),
      taskId,
      hostId: HOST,
      kind: 'git-worktree',
      worktreeId,
      nameSnapshot: worktreeId.split('/').at(-1),
      linkedVia: 'start',
      ...extra
    },
    'desktop'
  )
}

export function recordTerminal(
  work: LocalTasksService['execution'],
  taskId: string,
  ids: { paneKey?: string; tabId?: string; hostId?: string }
) {
  const result = work.recordSession(
    {
      clientOperationId: op(),
      taskId,
      hostId: HOST,
      surface: 'terminal',
      ...ids,
      agent: 'claude',
      linkedVia: 'start'
    },
    'desktop'
  )
  if (!result.ok) {
    throw new Error(result.code)
  }
  return result.session
}
