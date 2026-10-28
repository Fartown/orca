import { afterEach, describe, expect, it, vi } from 'vitest'
// Why: the Bun runner only moves SQLite tests to Node when they import this directly.
import '../sqlite/sync-database'
import type { LocalTaskStatusRow } from '../../shared/local-tasks/local-task-attention-rules'
import type { LocalTaskChangeScope } from '../../shared/local-tasks/local-task-types'
import {
  structuredAgentSessionPaneKey,
  structuredAgentSessionTabId
} from '../../shared/structured-agent-session-projection'
import { readLocalTaskAttentionStates } from './local-task-attention-store'
import type { LocalTaskHostSessionSource } from './local-task-host-session-source'
import { LocalTasksDatabase } from './local-tasks-database'
import { LocalTasksService } from './local-tasks-service'

let opId = 0
const op = (): string => `op-${++opId}`
const HOST = 'local'
const SHOP = 'repo-shop::/Users/me/shop'
const LEAF = '11111111-1111-4111-8111-111111111111'
const NOW = 1_000_000

const disposers: (() => void)[] = []

afterEach(() => {
  for (const dispose of disposers.splice(0)) {
    dispose()
  }
  vi.useRealTimers()
})

/** This host's agent status, as the binding hands it to the library. */
function fakeHost() {
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
  return { source, rows, live, contact, report, emit: () => listener?.() }
}

function setup(options: { clock?: () => number; host?: ReturnType<typeof fakeHost> } = {}) {
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
  const statusOf = (taskId: string) => service.getTask(taskId).task?.statusId
  return { db, service, work: service.execution, project, status, task, statusOf, volatile, host }
}

function linkWorktree(
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

function recordTerminal(
  work: LocalTasksService['execution'],
  taskId: string,
  ids: { paneKey?: string; tabId?: string }
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

describe('task workspace links', () => {
  it('publishes cascade scopes after removing a task with a session and a mark', () => {
    const { db, service, work, task, host } = setup()
    const parent = task('订单导出')
    linkWorktree(work, parent.id, SHOP)
    const paneKey = `tab-1:${LEAF}`
    const session = recordTerminal(work, parent.id, { paneKey })
    host.report(paneKey, { state: 'done' })
    const [item] = work.getProgress().items
    expect(
      work.snooze({
        clientOperationId: op(),
        taskSessionId: session.id,
        itemKey: item.key,
        until: NOW + 100_000
      }).ok
    ).toBe(true)
    const commits: LocalTaskChangeScope[][] = []
    db.onCommit((commit) => commits.push(commit.scopes))
    expect(service.removeTask({ clientOperationId: op(), taskId: parent.id })).toEqual({
      ok: true,
      removed: 1
    })
    expect(work.listLinks()).toEqual({ workspaces: [], sessions: [] })
    expect(db.prepare('SELECT COUNT(*) AS count FROM local_task_attention_state').get()).toEqual({
      count: 0
    })
    expect(commits).toEqual([expect.arrayContaining(['tasks', 'links', 'attention'])])
  })

  it('gives any task one workspace and a workspace one task, on hosts this Orca owns', () => {
    const { work, task } = setup()
    const first = task('订单导出')
    const second = task('登录超时')
    expect(linkWorktree(work, first.id, SHOP)).toMatchObject({
      ok: true,
      workspace: { taskId: first.id }
    })
    // Same checkout spelled with a trailing slash is still the same workspace.
    expect(linkWorktree(work, second.id, `${SHOP}/`)).toEqual({
      ok: false,
      code: 'workspace_already_linked',
      detail: first.ref
    })
    expect(linkWorktree(work, first.id, SHOP).ok).toBe(true)
    expect(linkWorktree(work, first.id, 'repo-shop::/Users/me/shop-2')).toEqual({
      ok: false,
      code: 'task_has_workspace',
      detail: 'shop'
    })
    expect(
      linkWorktree(work, first.id, 'repo-shop::/Users/me/shop-2', { replace: true })
    ).toMatchObject({ ok: true, workspace: { worktreeId: 'repo-shop::/Users/me/shop-2' } })
    // Any level holds its own workspace now, e.g. a subtask in another repo.
    const grandchild = task('接口', task('后端', first.id).id)
    expect(linkWorktree(work, grandchild.id, 'repo-api::/Users/me/api')).toMatchObject({
      ok: true,
      workspace: { taskId: grandchild.id }
    })
    // A paired server's workspace belongs in that server's own library.
    expect(linkWorktree(work, second.id, 'repo-x::/srv/x', { hostId: 'runtime:env-1' })).toEqual({
      ok: false,
      code: 'host_not_owned'
    })
    expect(linkWorktree(work, second.id, 'repo-x::/srv/x', { hostId: 'ssh:mini' }).ok).toBe(true)
    const folder = (taskId: string) =>
      work.linkWorkspace(
        {
          clientOperationId: op(),
          taskId,
          hostId: HOST,
          kind: 'folder',
          folderWorkspaceId: 'notes',
          linkedVia: 'manual'
        },
        'mobile'
      )
    expect(folder(task('第三个').id).ok).toBe(true)
    expect(folder(task('第四个').id)).toMatchObject({ code: 'workspace_already_linked' })
  })

  it('starts the task that began work, at any level, unless the project turned the rule off', () => {
    const { service, work, project, status, task, statusOf } = setup()
    const started = task('开工')
    linkWorktree(work, started.id, SHOP)
    expect(statusOf(started.id)).toBe(status('started'))
    expect(
      service.listEvents(started.id).events.find((event) => event.source === 'rule')
    ).toMatchObject({ kind: 'status', payload: { rule: 'start', to: status('started') } })

    const inReview = task('评审中')
    service.updateTask(
      { clientOperationId: op(), taskId: inReview.id, patch: { statusId: status('review') } },
      'desktop'
    )
    linkWorktree(work, inReview.id, 'repo-shop::/Users/me/review')
    expect(statusOf(inReview.id)).toBe(status('review'))

    service.updateProject({
      clientOperationId: op(),
      projectId: project.id,
      rules: { startMovesToInProgress: false }
    })
    const manual = task('手动')
    linkWorktree(work, manual.id, 'repo-shop::/Users/me/manual')
    expect(statusOf(manual.id)).toBe(status('unstarted'))

    // A grandchild's first session starts the grandchild, in the nearest ancestor's workspace.
    service.updateProject({
      clientOperationId: op(),
      projectId: project.id,
      rules: { startMovesToInProgress: true }
    })
    const child = task('后端', manual.id)
    const grandchild = task('接口', child.id)
    const session = recordTerminal(work, grandchild.id, { paneKey: `tab-1:${LEAF}` })
    expect(session).toMatchObject({
      taskId: grandchild.id,
      worktreeId: 'repo-shop::/Users/me/manual'
    })
    expect(statusOf(grandchild.id)).toBe(status('started'))
    expect(statusOf(child.id)).toBe(status('unstarted'))
    expect(statusOf(manual.id)).toBe(status('unstarted'))
  })

  it('needs an effective workspace for a session and keeps one link per pane or host session', () => {
    const { work, task } = setup()
    const parent = task('订单导出')
    const chat = (taskId: string, sessionId: string) =>
      work.recordSession(
        {
          clientOperationId: op(),
          taskId,
          hostId: HOST,
          surface: 'chat',
          sessionId,
          linkedVia: 'start'
        },
        'desktop'
      )
    expect(chat(parent.id, 's-1')).toEqual({ ok: false, code: 'workspace_required' })
    linkWorktree(work, parent.id, SHOP)
    const first = recordTerminal(work, parent.id, { paneKey: 'tab-1:leaf-1' })
    expect(recordTerminal(work, parent.id, { paneKey: 'tab-1:leaf-1' }).id).toBe(first.id)
    const other = task('另一个')
    linkWorktree(work, other.id, 'repo-shop::/Users/me/other')
    expect(
      work.recordSession(
        {
          clientOperationId: op(),
          taskId: other.id,
          hostId: HOST,
          surface: 'terminal',
          paneKey: 'tab-1:leaf-1',
          linkedVia: 'manual'
        },
        'desktop'
      )
    ).toEqual({ ok: false, code: 'session_already_linked', detail: parent.ref })
    expect(chat(other.id, 's-1').ok).toBe(true)
    expect(chat(parent.id, 's-1')).toEqual({
      ok: false,
      code: 'session_already_linked',
      detail: other.ref
    })
    expect(
      work.recordSession(
        {
          clientOperationId: op(),
          taskId: parent.id,
          hostId: 'runtime:env-1',
          surface: 'terminal',
          tabId: 'web-terminal-tab',
          linkedVia: 'manual'
        },
        'mobile'
      )
    ).toEqual({ ok: false, code: 'host_not_owned' })
  })

  it('refuses a session on a host or worktree that is not the task’s workspace', () => {
    const { work, task } = setup()
    const parent = task('订单导出')
    linkWorktree(work, parent.id, SHOP)
    const foreign = (hostId: string, worktreeId?: string) =>
      work.recordSession(
        {
          clientOperationId: op(),
          taskId: parent.id,
          hostId,
          worktreeId,
          surface: 'terminal',
          paneKey: `tab-${hostId}:leaf`,
          linkedVia: 'manual'
        },
        'mobile'
      )
    expect(foreign('ssh:other')).toEqual({ ok: false, code: 'invalid_argument' })
    expect(foreign(HOST, 'repo-shop::/Users/me/elsewhere')).toEqual({
      ok: false,
      code: 'invalid_argument'
    })
  })

  it('keeps one task per terminal tab while its pane key is still unknown (D5)', () => {
    const { work, task } = setup()
    const parent = task('订单导出')
    const other = task('另一个')
    linkWorktree(work, parent.id, SHOP)
    linkWorktree(work, other.id, 'repo-shop::/Users/me/other')
    const byTab = (taskId: string) =>
      work.recordSession(
        {
          clientOperationId: op(),
          taskId,
          hostId: HOST,
          surface: 'terminal',
          tabId: 'tab-1',
          linkedVia: 'start'
        },
        'desktop'
      )
    expect(byTab(parent.id).ok).toBe(true)
    expect(byTab(other.id)).toEqual({
      ok: false,
      code: 'session_already_linked',
      detail: parent.ref
    })
    expect(byTab(parent.id)).toMatchObject({ ok: true })
  })

  it('unlinks the subtree’s sessions in that workspace and keeps work done elsewhere', () => {
    const { service, work, task } = setup()
    const oldParent = task('旧父任务')
    const newParent = task('新父任务')
    const child = task('子任务', oldParent.id)
    linkWorktree(work, oldParent.id, SHOP)
    linkWorktree(work, newParent.id, 'repo-shop::/Users/me/new')
    const history = recordTerminal(work, child.id, { paneKey: 'tab-old:leaf' })

    // A task holding a workspace may still become a subtask; its link stays.
    expect(
      service.updateTask(
        { clientOperationId: op(), taskId: newParent.id, patch: { parentId: oldParent.id } },
        'desktop'
      )
    ).toMatchObject({ ok: true, task: { parentId: oldParent.id } })
    expect(
      service.updateTask(
        { clientOperationId: op(), taskId: child.id, patch: { parentId: newParent.id } },
        'desktop'
      ).ok
    ).toBe(true)
    // The nearest workspace is now the new parent's, so the old one is foreign to the child.
    expect(
      work.recordSession(
        {
          clientOperationId: op(),
          taskId: child.id,
          hostId: HOST,
          worktreeId: SHOP,
          surface: 'terminal',
          tabId: 'tab-old-new',
          linkedVia: 'manual'
        },
        'desktop'
      )
    ).toEqual({ ok: false, code: 'invalid_argument' })
    const fresh = recordTerminal(work, child.id, { paneKey: 'tab-new:leaf' })
    expect(fresh.worktreeId).toBe('repo-shop::/Users/me/new')
    const grandchild = task('孙任务', child.id)
    linkWorktree(work, grandchild.id, 'repo-api::/Users/me/api')
    const ownWork = recordTerminal(work, grandchild.id, { paneKey: 'tab-api:leaf' })
    recordTerminal(work, newParent.id, { paneKey: 'tab-parent:leaf' })

    expect(
      work.unlinkWorkspace({ clientOperationId: op(), taskId: newParent.id }, 'mobile')
    ).toEqual({ ok: true })
    const links = work.listLinks()
    expect(links.workspaces.map((workspace) => workspace.taskId).sort()).toEqual(
      [oldParent.id, grandchild.id].sort()
    )
    expect(links.sessions.map((session) => session.id).sort()).toEqual(
      [history.id, ownWork.id].sort()
    )
    expect(service.listEvents(newParent.id).events.at(-1)).toMatchObject({
      kind: 'workspace-unlinked',
      source: 'mobile',
      payload: { removedSessions: 2 }
    })
  })

  it('records a host change when a client finds the workspace elsewhere', () => {
    const { service, work, task } = setup()
    const first = task('订单导出')
    const second = task('登录超时')
    linkWorktree(work, first.id, SHOP)
    linkWorktree(work, second.id, SHOP.replace('shop', 'login'))
    const resolve = (taskId: string, patch: { hostId: string; instanceId?: string }) =>
      work.resolveWorkspace(
        { clientOperationId: op(), taskId, hostLabelSnapshot: 'mini', ...patch },
        'desktop'
      )
    expect(resolve(first.id, { hostId: 'ssh:mini', instanceId: 'inst-1' })).toMatchObject({
      ok: true,
      workspace: { hostId: 'ssh:mini', instanceId: 'inst-1' }
    })
    expect(service.listEvents(first.id).events.at(-1)).toMatchObject({
      kind: 'workspace-host',
      payload: { fromHostId: HOST, toHostId: 'ssh:mini', toHostLabel: 'mini' }
    })
    expect(resolve(second.id, { hostId: 'runtime:env-1' })).toEqual({
      ok: false,
      code: 'host_not_owned'
    })
    expect(
      work.resolveWorkspace(
        { clientOperationId: op(), taskId: second.id, hostId: 'ssh:mini', worktreeId: SHOP },
        'desktop'
      )
    ).toEqual({ ok: false, code: 'workspace_already_linked', detail: first.ref })
  })

  it('keeps one owner of a durable workspace across host moves', () => {
    const { work, task } = setup()
    const first = task('订单导出')
    const second = task('登录超时')
    expect(linkWorktree(work, first.id, SHOP, { instanceId: 'inst-1' }).ok).toBe(true)
    // Learned on another host, the same instance is still the first task's (D3).
    expect(
      linkWorktree(work, second.id, SHOP, { instanceId: 'inst-1', hostId: 'ssh:mini' })
    ).toEqual({ ok: false, code: 'workspace_already_linked', detail: first.ref })
    expect(
      work.resolveWorkspace(
        { clientOperationId: op(), taskId: first.id, hostId: 'ssh:mini' },
        'desktop'
      )
    ).toMatchObject({ ok: true, workspace: { hostId: 'ssh:mini', instanceId: 'inst-1' } })
    expect(linkWorktree(work, second.id, SHOP, { instanceId: 'inst-1' })).toEqual({
      ok: false,
      code: 'workspace_already_linked',
      detail: first.ref
    })
    work.unlinkWorkspace({ clientOperationId: op(), taskId: first.id }, 'desktop')
    expect(linkWorktree(work, second.id, SHOP, { instanceId: 'inst-1' })).toMatchObject({
      ok: true,
      workspace: { taskId: second.id }
    })
  })
})

describe('merged PR rule', () => {
  it('completes the task holding the PR’s workspace once and never re-completes it', () => {
    const { service, work, project, status, task, statusOf } = setup()
    const parent = task('订单导出')
    const child = task('后端', parent.id)
    linkWorktree(work, child.id, SHOP)
    service.updateTask(
      { clientOperationId: op(), taskId: child.id, patch: { statusId: status('review') } },
      'desktop'
    )
    const merged = { taskId: child.id, provider: 'github', prNumber: 42, headSha: 'abc' }
    expect(work.applyPrMerged({ clientOperationId: op(), ...merged })).toEqual({
      ok: true,
      applied: true
    })
    expect(statusOf(child.id)).toBe(status('completed'))
    // Its ancestors stay where the user put them.
    expect(statusOf(parent.id)).toBe(status('unstarted'))
    expect(service.listEvents(child.id).events.at(-1)).toMatchObject({
      kind: 'status',
      source: 'rule',
      payload: { rule: 'pr-merged', prNumber: 42 }
    })
    service.updateTask(
      { clientOperationId: op(), taskId: child.id, patch: { statusId: status('started') } },
      'desktop'
    )
    expect(work.applyPrMerged({ clientOperationId: op(), ...merged })).toEqual({
      ok: true,
      applied: false
    })
    expect(statusOf(child.id)).toBe(status('started'))
    // A task working in an ancestor's workspace holds no PR of its own.
    expect(
      work.applyPrMerged({ clientOperationId: op(), ...merged, taskId: parent.id, prNumber: 7 })
    ).toEqual({ ok: true, applied: false })

    service.updateProject({
      clientOperationId: op(),
      projectId: project.id,
      rules: { prMergedCompletes: false }
    })
    const other = task('规则关闭')
    linkWorktree(work, other.id, 'repo-shop::/Users/me/off')
    expect(work.applyPrMerged({ clientOperationId: op(), ...merged, taskId: other.id })).toEqual({
      ok: true,
      applied: false
    })
  })
})

describe('host attention judgment', () => {
  function linkedSession(
    context: ReturnType<typeof setup>,
    ids: { paneKey?: string; tabId?: string }
  ) {
    const parent = context.task('订单导出')
    linkWorktree(context.work, parent.id, `${SHOP}-${parent.number}`)
    return { task: parent, session: recordTerminal(context.work, parent.id, ids) }
  }

  it('sorts this host’s statuses into the four kinds and leaves the rest alone', () => {
    const context = setup()
    const { work, host } = context
    const panes = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((tab) => `tab-${tab}:${LEAF}`)
    const sessions = panes.map((paneKey) => linkedSession(context, { paneKey }).session)
    const approval = JSON.stringify({ approval: { tool: 'Bash', summary: 'rm -rf build' } })
    host.report(panes[0], { state: 'waiting', interactivePrompt: approval })
    host.report(panes[1], { state: 'waiting', toolName: 'AskUserQuestion' })
    host.report(panes[2], { state: 'blocked' })
    host.report(panes[3], {
      state: 'done',
      lastAssistantMessage: '导出接口好了',
      agentType: 'claude'
    })
    // A session boundary finished no turn; a replayed wait is not news yet.
    host.report(panes[4], { state: 'done', sessionBoundary: true })
    host.report(panes[5], { state: 'waiting', restoredUnconfirmed: true })
    host.report(panes[6], { state: 'working' })
    const progress = work.getProgress()
    expect(
      progress.items.map((item) => [
        sessions.findIndex((s) => s.id === item.taskSessionId),
        item.kind
      ])
    ).toEqual(
      expect.arrayContaining([
        [0, 'approval'],
        [1, 'question'],
        [2, 'blocked'],
        [3, 'unread-done']
      ])
    )
    expect(progress.items).toHaveLength(4)
    expect(progress.items.find((item) => item.kind === 'unread-done')).toMatchObject({
      key: `${panes[3]}@${NOW - 10}`,
      replyable: true,
      agent: 'claude',
      lastMessage: '导出接口好了'
    })
    expect(progress.sessions.find((s) => s.taskSessionId === sessions[6].id)).toMatchObject({
      state: 'working'
    })
  })

  it('reads a structured chat’s blocked as a question and claims its pane from the session id', () => {
    const context = setup()
    const parent = context.task('聊天')
    linkWorktree(context.work, parent.id, SHOP)
    const chat = context.work.recordSession(
      {
        clientOperationId: op(),
        taskId: parent.id,
        hostId: HOST,
        surface: 'chat',
        sessionId: 'sess-1',
        linkedVia: 'start'
      },
      'desktop'
    )
    expect(chat.ok).toBe(true)
    // Before its host reports, a chat that never spoke is unknown, not ended.
    expect(context.work.getProgress().sessions).toMatchObject([{ state: 'unknown' }])
    const hostPane = structuredAgentSessionPaneKey(structuredAgentSessionTabId('sess-1'), 'sess-1')
    context.host.report(hostPane, { state: 'blocked', structuredHost: 'owned' })
    expect(context.work.getProgress().items).toMatchObject([{ kind: 'question' }])
  })

  it('hides a seen or snoozed item until its next turn, and marks it in this library', () => {
    vi.useFakeTimers()
    let now = NOW
    const context = setup({ clock: () => now })
    const { work, host, volatile } = context
    const paneKey = `tab-1:${LEAF}`
    const { session } = linkedSession(context, { paneKey })
    work.start()
    host.report(paneKey, { state: 'done' })
    const [first] = work.getProgress().items
    expect(first).toMatchObject({ kind: 'unread-done' })
    expect(
      work.acknowledge({ clientOperationId: op(), itemKey: first.key, taskSessionId: session.id })
    ).toEqual({ ok: true })
    expect(work.getProgress()).toMatchObject({
      items: [],
      sessions: [{ state: 'done', unread: false }]
    })

    // The next turn ends at a new time: a new item, even though the last one was seen.
    host.report(paneKey, { state: 'done', stateStartedAt: NOW + 5, receivedAt: NOW + 5 })
    const [second] = work.getProgress().items
    expect(second.key).not.toBe(first.key)
    expect(
      work.snooze({
        clientOperationId: op(),
        taskSessionId: session.id,
        itemKey: second.key,
        until: NOW + 60_000
      })
    ).toEqual({ ok: true })
    expect(work.getProgress().items).toEqual([])
    vi.advanceTimersByTime(200)
    volatile.length = 0
    // The snooze's end is a local deadline: no status changes, yet the item returns and is announced.
    now = NOW + 60_000
    vi.advanceTimersByTime(60_000)
    expect(volatile).toEqual([['attention']])
    expect(work.getProgress().items).toMatchObject([{ key: second.key }])
  })

  /** Two finished turns on two tasks' sessions, as V01 reproduced the crossed marks. */
  function twoDoneSessions() {
    const context = setup()
    const panes = [`tab-a:${LEAF}`, `tab-b:${LEAF}`]
    const [a, b] = panes.map((paneKey) => linkedSession(context, { paneKey }).session)
    for (const paneKey of panes) {
      context.host.report(paneKey, { state: 'done' })
    }
    const itemOf = (taskSessionId: string) => {
      const found = context.work.getProgress().items.find((i) => i.taskSessionId === taskSessionId)
      if (!found) {
        throw new Error(`no item for ${taskSessionId}`)
      }
      return found
    }
    const listed = () =>
      context.work
        .getProgress()
        .items.map((item) => item.taskSessionId)
        .sort()
    return { ...context, panes, a, b, itemOf, listed }
  }

  it('refuses a seen or snooze mark that pairs one session with another session’s item', () => {
    const { db, work, panes, a, b, itemOf, listed } = twoDoneSessions()
    const keyOfB = itemOf(b.id).key
    const until = NOW + 60_000
    for (const itemKey of [keyOfB, `${panes[1]}@1`]) {
      expect(work.acknowledge({ clientOperationId: op(), itemKey, taskSessionId: a.id })).toEqual({
        ok: false,
        code: 'attention_item_mismatch'
      })
      expect(work.snooze({ clientOperationId: op(), itemKey, taskSessionId: a.id, until })).toEqual(
        { ok: false, code: 'attention_item_mismatch' }
      )
    }
    expect([...readLocalTaskAttentionStates(db).keys()]).toEqual([])
    expect(listed()).toEqual([a.id, b.id].sort())
  })

  it('marks an item for the session that raises it now', () => {
    const { db, work, a, b, itemOf, listed } = twoDoneSessions()
    const keyOfA = itemOf(a.id).key
    const keyOfB = itemOf(b.id).key
    expect(
      work.acknowledge({ clientOperationId: op(), itemKey: keyOfB, taskSessionId: b.id })
    ).toEqual({ ok: true })
    expect(
      work.snooze({
        clientOperationId: op(),
        itemKey: keyOfA,
        taskSessionId: a.id,
        until: NOW + 60_000
      })
    ).toEqual({ ok: true })
    expect(listed()).toEqual([])
    expect(readLocalTaskAttentionStates(db)).toEqual(
      new Map([
        [keyOfB, { seenAt: NOW, snoozedUntil: null }],
        [keyOfA, { seenAt: null, snoozedUntil: NOW + 60_000 }]
      ])
    )
  })

  it('writes nothing for a wait its session already moved past, and keeps the next one shown', () => {
    const { db, work, host, panes, a, itemOf } = twoDoneSessions()
    const earlier = itemOf(a.id).key
    host.report(panes[0], { state: 'done', stateStartedAt: NOW + 5, receivedAt: NOW + 5 })
    expect(
      work.acknowledge({ clientOperationId: op(), itemKey: earlier, taskSessionId: a.id })
    ).toEqual({ ok: true })
    expect(
      work.snooze({
        clientOperationId: op(),
        itemKey: earlier,
        taskSessionId: a.id,
        until: NOW + 60_000
      })
    ).toEqual({ ok: true })
    expect([...readLocalTaskAttentionStates(db).keys()]).toEqual([])
    expect(itemOf(a.id).key).toBe(`${panes[0]}@${NOW + 5}`)
  })

  it('announces a judged change once per window and says nothing when nothing changed', () => {
    vi.useFakeTimers()
    const context = setup()
    const { work, host, volatile } = context
    const paneKey = `tab-1:${LEAF}`
    linkedSession(context, { paneKey })
    work.start()
    host.report(paneKey, { state: 'working' })
    vi.advanceTimersByTime(200)
    expect(volatile).toEqual([['attention']])
    host.report(paneKey, { state: 'working' })
    host.emit()
    vi.advanceTimersByTime(200)
    expect(volatile).toEqual([['attention']])
    host.report(paneKey, { state: 'waiting', stateStartedAt: NOW, receivedAt: NOW })
    host.report(paneKey, { state: 'done', stateStartedAt: NOW, receivedAt: NOW })
    vi.advanceTimersByTime(200)
    expect(volatile).toEqual([['attention'], ['attention']])
  })

  it('claims the host pane of a terminal recorded by tab alone', () => {
    vi.useFakeTimers()
    const context = setup()
    const { db, work, host } = context
    const { session } = linkedSession(context, { tabId: 'tab-1' })
    work.start()
    const commits: LocalTaskChangeScope[][] = []
    db.onCommit((commit) => commits.push(commit.scopes))
    host.report(`tab-other:${LEAF}`, { state: 'working' })
    host.report(`tab-1:${LEAF}`, { state: 'waiting' })
    vi.advanceTimersByTime(200)
    expect(work.listLinks().sessions).toMatchObject([
      { id: session.id, tabId: 'tab-1', paneKey: `tab-1:${LEAF}` }
    ])
    expect(commits).toEqual([['links']])
    expect(work.getProgress().items).toMatchObject([{ taskSessionId: session.id }])
  })

  it('says unverifiable for an SSH target out of contact and ended once a pane stops reporting', () => {
    const context = setup()
    const { work, host, task } = context
    const remote = task('远程')
    linkWorktree(work, remote.id, 'repo-shop::/home/me/shop', { hostId: 'ssh:mini' })
    const remotePane = `tab-r:${LEAF}`
    const remoteSession = work.recordSession(
      {
        clientOperationId: op(),
        taskId: remote.id,
        hostId: 'ssh:mini',
        surface: 'terminal',
        paneKey: remotePane,
        linkedVia: 'start'
      },
      'desktop'
    )
    host.report(remotePane, { state: 'waiting', lastAssistantMessage: '要不要继续？' })
    host.contact.add('ssh:mini')
    expect(work.getProgress().items).toHaveLength(1)
    host.contact.delete('ssh:mini')
    expect(work.getProgress()).toMatchObject({
      items: [],
      sessions: [
        {
          taskSessionId: remoteSession.ok ? remoteSession.session.id : '',
          state: 'unverifiable',
          lastMessage: '要不要继续？'
        }
      ]
    })

    const { session } = linkedSession(context, { paneKey: `tab-1:${LEAF}` })
    const stateOf = () =>
      work.getProgress().sessions.find((entry) => entry.taskSessionId === session.id)?.state
    expect(stateOf()).toBe('unknown')
    host.report(`tab-1:${LEAF}`, { state: 'working' })
    expect(stateOf()).toBe('working')
    host.rows.delete(`tab-1:${LEAF}`)
    host.live.add(`tab-1:${LEAF}`)
    expect(stateOf()).toBe('exited')
    host.live.delete(`tab-1:${LEAF}`)
    expect(stateOf()).toBe('missing')
  })
})
