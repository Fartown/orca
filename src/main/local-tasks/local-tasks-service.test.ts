import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
// Why a value import: the Bun runner only moves SQLite tests to Node when they import this directly.
import SyncDatabase from '../sqlite/sync-database'
import {
  getLocalTasksDatabasePath,
  LocalTasksDatabase,
  type LocalTasksCommit
} from './local-tasks-database'
import { LocalTasksService } from './local-tasks-service'

let opId = 0
const op = (): string => `op-${++opId}`
const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function setup() {
  const db = LocalTasksDatabase.openTransient()
  let clock = 1_000
  const service = new LocalTasksService(db, () => ++clock)
  const created = service.createProject({
    clientOperationId: op(),
    name: '商城',
    prefix: 'shop',
    orcaProjectId: 'orca-project-shop'
  })
  if (!created.ok) {
    throw new Error(created.code)
  }
  return { db, service, project: created.project }
}

function createTask(
  service: LocalTasksService,
  projectId: string,
  title: string,
  parentId?: string
) {
  const result = service.createTask(
    { clientOperationId: op(), projectId, title, parentId },
    'desktop'
  )
  if (!result.ok) {
    throw new Error(result.code)
  }
  return result.task
}

describe('LocalTasksService', () => {
  it('seeds a project with one status per category and refuses a taken prefix or Orca project', () => {
    const { service, project } = setup()
    expect(project.prefix).toBe('SHOP')
    expect(project.statuses.map((status) => status.category)).toEqual([
      'backlog',
      'unstarted',
      'started',
      'review',
      'completed',
      'canceled'
    ])
    const samePrefix = service.createProject({
      clientOperationId: op(),
      name: 'Other',
      prefix: 'SHOP',
      orcaProjectId: 'orca-project-other'
    })
    expect(samePrefix).toEqual({ ok: false, code: 'prefix_taken', detail: '商城' })
    const sameRepo = service.createProject({
      clientOperationId: op(),
      name: 'Other',
      prefix: 'OTH',
      orcaProjectId: 'orca-project-shop'
    })
    expect(sameRepo).toEqual({ ok: false, code: 'orca_project_linked', detail: '商城' })
  })

  it('numbers tasks per project and keeps old refs working after a prefix change', () => {
    const { service, project } = setup()
    const first = createTask(service, project.id, '订单导出支持 CSV')
    const second = createTask(service, project.id, '登录超时后跳转丢失')
    expect([first.ref, second.ref]).toEqual(['SHOP-1', 'SHOP-2'])

    const renamed = service.updateProject({
      clientOperationId: op(),
      projectId: project.id,
      prefix: 'MALL'
    })
    expect(renamed.ok && renamed.project.aliases).toEqual(['SHOP'])
    expect(service.getTask('SHOP-1').task?.id).toBe(first.id)
    expect(service.getTask('mall-1').task?.ref).toBe('MALL-1')
    const reuse = service.createProject({
      clientOperationId: op(),
      name: 'Other',
      prefix: 'SHOP',
      orcaProjectId: 'orca-project-other'
    })
    expect(reuse.ok).toBe(false)
  })

  it('allows two levels only', () => {
    const { service, project } = setup()
    const parent = createTask(service, project.id, '订单导出')
    const child = createTask(service, project.id, '后端', parent.id)
    const grandchild = service.createTask(
      { clientOperationId: op(), projectId: project.id, title: '太深', parentId: child.id },
      'desktop'
    )
    expect(grandchild).toEqual({ ok: false, code: 'parent_invalid' })
    const reparent = service.updateTask(
      {
        clientOperationId: op(),
        taskId: parent.id,
        patch: { parentId: createTask(service, project.id, 'x').id }
      },
      'desktop'
    )
    expect(reparent).toEqual({ ok: false, code: 'parent_invalid' })
  })

  it('records one activity entry per changed field and rejects a stale revision', () => {
    const { service, project } = setup()
    const task = createTask(service, project.id, '订单导出')
    const started = project.statuses.find((status) => status.category === 'started')
    const updated = service.updateTask(
      {
        clientOperationId: op(),
        taskId: task.id,
        expectedRevision: task.revision,
        patch: { title: '订单导出支持 CSV', statusId: started?.id, priority: 2, labels: ['功能'] }
      },
      'mobile'
    )
    expect(updated.ok).toBe(true)
    const kinds = service.listEvents(task.id).events.map((event) => [event.kind, event.source])
    expect(kinds).toEqual([
      ['created', 'desktop'],
      ['title', 'mobile'],
      ['status', 'mobile'],
      ['priority', 'mobile'],
      ['labels', 'mobile']
    ])
    const stale = service.updateTask(
      {
        clientOperationId: op(),
        taskId: task.id,
        expectedRevision: task.revision,
        patch: { title: 'x' }
      },
      'desktop'
    )
    expect(stale).toEqual({ ok: false, code: 'stale' })
  })

  it('replays the first result for a repeated client operation id', () => {
    const { service, project } = setup()
    const input = {
      clientOperationId: 'phone-resend',
      projectId: project.id,
      title: '优惠券过期提醒'
    }
    const first = service.createTask(input, 'mobile')
    const second = service.createTask(input, 'mobile')
    expect(second).toEqual(first)
    expect(service.listTasks(project.id).tasks).toHaveLength(1)
  })

  it('keeps one status per category and moves tasks off a removed status', () => {
    const { service, project } = setup()
    const todo = project.statuses.find((status) => status.category === 'unstarted')
    const task = createTask(service, project.id, '订单导出')
    expect(
      service.removeStatus({ clientOperationId: op(), statusId: todo?.id ?? '' }, 'desktop')
    ).toEqual({
      ok: false,
      code: 'last_status_in_category'
    })
    const added = service.upsertStatus({
      clientOperationId: op(),
      projectId: project.id,
      category: 'unstarted',
      name: '排期中',
      color: 'blue'
    })
    const addedId = added.ok ? added.statusId : ''
    expect(
      service.removeStatus({ clientOperationId: op(), statusId: todo?.id ?? '' }, 'desktop')
    ).toEqual({
      ok: false,
      code: 'status_in_use',
      detail: '1'
    })
    const removed = service.removeStatus(
      { clientOperationId: op(), statusId: todo?.id ?? '', moveTasksToStatusId: addedId },
      'desktop'
    )
    expect(removed.ok).toBe(true)
    expect(service.getTask(task.id).task?.statusId).toBe(addedId)
  })

  it('moves a task with its subtasks and resolves the refs they used to have', () => {
    const { service, project } = setup()
    const target = service.createProject({
      clientOperationId: op(),
      name: 'Orca',
      prefix: 'ORC',
      orcaProjectId: 'orca-project-orca'
    })
    const targetId = target.ok ? target.project.id : ''
    const parent = createTask(service, project.id, '订单导出')
    createTask(service, project.id, '后端', parent.id)
    const moved = service.moveTask(
      { clientOperationId: op(), taskId: parent.id, targetProjectId: targetId },
      'desktop'
    )
    expect(moved.ok && moved.task.ref).toBe('ORC-1')
    expect(service.getTask('SHOP-1').task?.ref).toBe('ORC-1')
    expect(service.getTask('SHOP-2').task?.ref).toBe('ORC-2')
  })

  it('removes a task with its subtasks and never reuses their numbers', () => {
    const { service, project } = setup()
    const parent = createTask(service, project.id, '订单导出')
    createTask(service, project.id, '后端', parent.id)
    expect(service.removeTask({ clientOperationId: op(), taskId: parent.id })).toEqual({
      ok: true,
      removed: 2
    })
    expect(service.listTasks(project.id).tasks).toHaveLength(0)
    expect(createTask(service, project.id, '新任务').ref).toBe('SHOP-3')
  })

  it('announces a commit with its scopes and bumped revision, and stays quiet on failure', () => {
    const { db, service, project } = setup()
    const commits: LocalTasksCommit[] = []
    db.onCommit((commit) => commits.push(commit))
    const before = service.revision()
    createTask(service, project.id, '订单导出')
    service.updateTask(
      { clientOperationId: op(), taskId: 'missing', patch: { title: 'x' } },
      'desktop'
    )
    expect(commits).toHaveLength(1)
    expect(commits[0].revision).toBe(before + 1)
    expect(commits[0].scopes).toEqual(expect.arrayContaining(['tasks', 'events']))
  })

  it('opens a library written by a newer Orca read-only and refuses writes', () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'local-tasks-'))
    tempDirs.push(userDataPath)
    LocalTasksDatabase.open('profile-a', userDataPath).close()
    const raw = new SyncDatabase(getLocalTasksDatabasePath('profile-a', userDataPath))
    raw.pragma('user_version = 99')
    raw.close()
    const db = LocalTasksDatabase.open('profile-a', userDataPath)
    const service = new LocalTasksService(db)
    expect(service.readOnly).toBe(true)
    expect(
      service.createProject({ clientOperationId: op(), name: 'x', prefix: 'X', orcaProjectId: 'p' })
    ).toEqual({ ok: false, code: 'read_only' })
    db.close()
  })
})
