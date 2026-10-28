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
import {
  buildLocalTaskIndex,
  isLocalTaskVisible
} from '../../shared/local-tasks/local-task-grouping'

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
    repos: ['orca-project-shop']
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
  it('seeds a project with one status per category and refuses a taken prefix only', () => {
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
      repos: ['orca-project-other']
    })
    expect(samePrefix).toEqual({ ok: false, code: 'prefix_taken', detail: '商城' })
    // Several task projects may share one Orca project (D-008).
    const sameRepo = service.createProject({
      clientOperationId: op(),
      name: 'Other',
      prefix: 'OTH',
      repos: ['orca-project-shop']
    })
    expect(sameRepo).toMatchObject({
      ok: true,
      project: { repos: ['orca-project-shop'], defaultRepoId: 'orca-project-shop' }
    })
  })

  it('links no repo or several, keeps one of them the default, and edits the list', () => {
    const { service } = setup()
    const research = service.createProject({ clientOperationId: op(), name: '调研', prefix: 'RS' })
    expect(research).toMatchObject({ ok: true, project: { repos: [], defaultRepoId: null } })
    if (!research.ok) {
      throw new Error(research.code)
    }
    expect(createTask(service, research.project.id, '竞品调研').ref).toBe('RS-1')

    const stack = service.createProject({
      clientOperationId: op(),
      name: '前后端',
      prefix: 'FS',
      repos: ['github:acme/web', 'github:acme/api'],
      defaultRepoId: 'github:acme/api'
    })
    expect(stack).toMatchObject({
      ok: true,
      project: { repos: ['github:acme/web', 'github:acme/api'], defaultRepoId: 'github:acme/api' }
    })
    const stackId = stack.ok ? stack.project.id : ''
    const update = (patch: { repos?: string[]; defaultRepoId?: string | null }) =>
      service.updateProject({ clientOperationId: op(), projectId: stackId, ...patch })
    expect(update({ defaultRepoId: 'github:acme/docs' })).toEqual({
      ok: false,
      code: 'invalid_argument'
    })
    // Dropping the default moves it to the first repo left; adding keeps the order given.
    expect(update({ repos: ['github:acme/web', 'github:acme/docs'] })).toMatchObject({
      ok: true,
      project: { repos: ['github:acme/web', 'github:acme/docs'], defaultRepoId: 'github:acme/web' }
    })
    expect(update({ defaultRepoId: 'github:acme/docs' })).toMatchObject({
      project: { defaultRepoId: 'github:acme/docs' }
    })
    expect(update({ repos: [] })).toMatchObject({
      ok: true,
      project: { repos: [], defaultRepoId: null }
    })
    expect(
      service.updateProject({
        clientOperationId: op(),
        projectId: research.project.id,
        defaultRepoId: null
      })
    ).toMatchObject({ ok: true })
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
      repos: ['orca-project-other']
    })
    expect(reuse.ok).toBe(false)
  })

  it('reserves prefixes of live moved-task aliases after their old project is deleted', () => {
    const { service, project } = setup()
    const target = service.createProject({
      clientOperationId: op(),
      name: '目标',
      prefix: 'DEST',
      repos: ['orca-project-dest']
    })
    if (!target.ok) {
      throw new Error(target.code)
    }
    const movedTask = createTask(service, project.id, '迁移任务')
    expect(
      service.moveTask(
        { clientOperationId: op(), taskId: movedTask.id, targetProjectId: target.project.id },
        'desktop'
      ).ok
    ).toBe(true)
    const renamed = service.updateProject({
      clientOperationId: op(),
      projectId: project.id,
      prefix: 'ALT'
    })
    expect(renamed.ok && renamed.project.prefix).toBe('ALT')
    const restored = service.updateProject({
      clientOperationId: op(),
      projectId: project.id,
      prefix: 'SHOP'
    })
    expect(restored.ok && restored.project.prefix).toBe('SHOP')
    expect(service.removeProject({ clientOperationId: op(), projectId: project.id })).toEqual({
      ok: true
    })
    expect(service.getTask('SHOP-1').task?.id).toBe(movedTask.id)

    expect(
      service.updateProject({
        clientOperationId: op(),
        projectId: target.project.id,
        prefix: 'SHOP'
      })
    ).toEqual({ ok: false, code: 'prefix_history_in_project' })

    expect(
      service.createProject({
        clientOperationId: op(),
        name: '新项目',
        prefix: 'shop',
        repos: ['orca-project-new']
      })
    ).toEqual({ ok: false, code: 'prefix_taken', detail: '目标' })
    const other = service.createProject({
      clientOperationId: op(),
      name: '新项目',
      prefix: 'OTHER',
      repos: ['orca-project-new']
    })
    if (!other.ok) {
      throw new Error(other.code)
    }
    expect(
      service.updateProject({
        clientOperationId: op(),
        projectId: other.project.id,
        prefix: 'SHOP'
      })
    ).toEqual({ ok: false, code: 'prefix_taken', detail: '目标' })
    expect(service.getTask('SHOP-1').task?.id).toBe(movedTask.id)

    expect(service.removeTask({ clientOperationId: op(), taskId: movedTask.id })).toEqual({
      ok: true,
      removed: 1
    })
    expect(service.getTask('SHOP-1').task).toBeNull()
    const released = service.updateProject({
      clientOperationId: op(),
      projectId: other.project.id,
      prefix: 'SHOP'
    })
    expect(released.ok && released.project.prefix).toBe('SHOP')
    const ownAlias = service.updateProject({
      clientOperationId: op(),
      projectId: other.project.id,
      prefix: 'OTHER'
    })
    expect(ownAlias.ok && ownAlias.project.prefix).toBe('OTHER')
  })

  it('nests any depth and refuses a parent that would close a loop', () => {
    const { service, project } = setup()
    const root = createTask(service, project.id, '订单导出')
    const child = createTask(service, project.id, '后端', root.id)
    const grandchild = createTask(service, project.id, '导出接口', child.id)
    const subtasks = service.createSubtasks(
      { clientOperationId: op(), parentId: grandchild.id, titles: ['字段', '分页'] },
      'desktop'
    )
    expect(subtasks.ok && subtasks.tasks.map((task) => task.parentId)).toEqual([
      grandchild.id,
      grandchild.id
    ])
    const reparent = (taskId: string, parentId: string | null) =>
      service.updateTask({ clientOperationId: op(), taskId, patch: { parentId } }, 'desktop')
    expect(reparent(root.id, grandchild.id)).toEqual({ ok: false, code: 'parent_invalid' })
    expect(reparent(root.id, root.id)).toEqual({ ok: false, code: 'parent_invalid' })
    const sibling = createTask(service, project.id, '前端')
    expect(reparent(sibling.id, grandchild.id)).toMatchObject({
      ok: true,
      task: { parentId: grandchild.id }
    })
    expect(reparent(child.id, null)).toMatchObject({ ok: true, task: { parentId: null } })
    const other = service.createProject({ clientOperationId: op(), name: '别的', prefix: 'OT' })
    const foreign = createTask(service, other.ok ? other.project.id : '', '别的项目')
    expect(reparent(root.id, foreign.id)).toEqual({ ok: false, code: 'parent_invalid' })
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

  it('replays a creation after more than 1000 writes and after reopening the SQLite library', () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'local-tasks-receipts-'))
    tempDirs.push(userDataPath)
    const db = LocalTasksDatabase.open('profile-receipts', userDataPath)
    const service = new LocalTasksService(db)
    const created = service.createProject({
      clientOperationId: op(),
      name: '回执项目',
      prefix: 'RECEIPT',
      repos: ['orca-project-receipts']
    })
    if (!created.ok) {
      throw new Error(created.code)
    }
    const input = {
      clientOperationId: 'long-delayed-create',
      projectId: created.project.id,
      title: '第一次创建'
    }
    const first = service.createTask(input, 'mobile')
    if (!first.ok) {
      throw new Error(first.code)
    }
    for (let index = 0; index < 1001; index++) {
      createTask(service, created.project.id, `后续写入 ${index}`)
    }
    expect(service.createTask(input, 'mobile')).toEqual(first)
    expect(service.listTasks(created.project.id).tasks).toHaveLength(1002)
    db.close()

    const reopened = LocalTasksDatabase.open('profile-receipts', userDataPath)
    try {
      const restored = new LocalTasksService(reopened)
      expect(restored.createTask(input, 'mobile')).toEqual(first)
      expect(restored.listTasks(created.project.id).tasks).toHaveLength(1002)
    } finally {
      reopened.close()
    }
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

  it('moves a whole subtree, renumbers it and resolves the refs it used to have', () => {
    const { service, project } = setup()
    const target = service.createProject({
      clientOperationId: op(),
      name: 'Orca',
      prefix: 'ORC',
      repos: ['orca-project-orca']
    })
    const targetId = target.ok ? target.project.id : ''
    const root = createTask(service, project.id, '订单导出')
    const middle = createTask(service, project.id, '后端', root.id)
    createTask(service, project.id, '接口', middle.id)
    createTask(service, project.id, '不动的')
    service.execution.linkWorkspace(
      {
        clientOperationId: op(),
        taskId: middle.id,
        hostId: 'local',
        kind: 'git-worktree',
        worktreeId: 'repo-shop::/Users/me/shop',
        linkedVia: 'start'
      },
      'desktop'
    )
    // A task in the middle moves with its own subtree and heads it in the new project.
    const moved = service.moveTask(
      { clientOperationId: op(), taskId: middle.id, targetProjectId: targetId },
      'desktop'
    )
    expect(moved).toMatchObject({ ok: true, task: { ref: 'ORC-1', parentId: null } })
    expect(service.getTask('SHOP-2').task?.ref).toBe('ORC-1')
    expect(service.getTask('SHOP-3').task).toMatchObject({ ref: 'ORC-2', parentId: middle.id })
    expect(service.getTask('SHOP-1').task?.projectId).toBe(project.id)
    expect(service.getTask('SHOP-4').task?.projectId).toBe(project.id)
    // Its workspace stays linked: links name work, not projects.
    expect(service.execution.listLinks().workspaces.map((link) => link.taskId)).toEqual([middle.id])
    const listed = service.listTasks(targetId).tasks
    expect(listed.map((task) => [task.ref, task.formerRefs])).toEqual([
      ['ORC-1', ['SHOP-2']],
      ['ORC-2', ['SHOP-3']]
    ])
    // The clients' own search finds what the host resolves, from the refs each task carries.
    const index = buildLocalTaskIndex(service.listProjects().projects, listed)
    const search = (query: string): string[] =>
      listed
        .filter((task) =>
          isLocalTaskVisible(task, index, {
            view: 'all',
            filters: { priorities: [], labels: [], categories: [] },
            query
          })
        )
        .map((task) => task.ref)
    expect(search('SHOP-2')).toEqual(['ORC-1'])
    expect(search('shop-03')).toEqual(['ORC-2'])
  })

  it('removes a task with every descendant and never reuses their numbers', () => {
    const { service, project } = setup()
    const root = createTask(service, project.id, '订单导出')
    const child = createTask(service, project.id, '后端', root.id)
    createTask(service, project.id, '接口', child.id)
    createTask(service, project.id, '前端', root.id)
    expect(service.removeTask({ clientOperationId: op(), taskId: root.id })).toEqual({
      ok: true,
      removed: 4
    })
    expect(service.listTasks(project.id).tasks).toHaveLength(0)
    expect(createTask(service, project.id, '新任务').ref).toBe('SHOP-5')
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

  it('tells the link and attention scopes when a task with linked work is deleted', () => {
    const { db, service, project } = setup()
    const parent = createTask(service, project.id, '订单导出')
    service.execution.linkWorkspace(
      {
        clientOperationId: op(),
        taskId: parent.id,
        hostId: 'local',
        kind: 'git-worktree',
        worktreeId: 'repo-shop::/Users/me/shop',
        linkedVia: 'start'
      },
      'desktop'
    )
    const commits: LocalTasksCommit[] = []
    db.onCommit((commit) => commits.push(commit))
    expect(service.removeTask({ clientOperationId: op(), taskId: parent.id })).toEqual({
      ok: true,
      removed: 1
    })
    expect(commits).toHaveLength(1)
    expect(commits[0].scopes).toEqual(expect.arrayContaining(['tasks', 'links', 'attention']))
  })

  it('tells the link scopes when a project with linked work is deleted, else only project scopes', () => {
    const { db, service, project } = setup()
    const linked = createTask(service, project.id, '订单导出')
    service.execution.linkWorkspace(
      {
        clientOperationId: op(),
        taskId: linked.id,
        hostId: 'local',
        kind: 'git-worktree',
        worktreeId: 'repo-shop::/Users/me/shop',
        linkedVia: 'start'
      },
      'desktop'
    )
    const withLinks: LocalTasksCommit[] = []
    const release = db.onCommit((commit) => withLinks.push(commit))
    expect(service.removeProject({ clientOperationId: op(), projectId: project.id })).toEqual({
      ok: true
    })
    release()
    expect(withLinks[0].scopes).toEqual(
      expect.arrayContaining(['projects', 'tasks', 'links', 'attention'])
    )

    const bare = service.createProject({
      clientOperationId: op(),
      name: '空项目',
      prefix: 'EMPTY',
      repos: ['orca-project-empty']
    })
    const bareId = bare.ok ? bare.project.id : ''
    const bareCommits: LocalTasksCommit[] = []
    db.onCommit((commit) => bareCommits.push(commit))
    service.removeProject({ clientOperationId: op(), projectId: bareId })
    expect(bareCommits[0].scopes).not.toContain('links')
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
      service.createProject({ clientOperationId: op(), name: 'x', prefix: 'X', repos: ['p'] })
    ).toEqual({ ok: false, code: 'read_only' })
    db.close()
  })
})
