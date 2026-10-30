import { describe, expect, it } from 'vitest'
import { buildLocalTaskIndex } from '../../../src/shared/local-tasks/local-task-grouping'
import type {
  LocalTaskLinks,
  LocalTaskProgressSnapshot,
  LocalTaskSessionLink
} from '../../../src/shared/local-tasks/local-task-link-types'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import { localTaskRowSessionStates } from './local-task-progress-projection'

function task(id: string, parentId: string | null): LocalTask {
  return {
    id,
    projectId: 'p',
    number: Number(id.slice(1)),
    ref: `SHOP-${id.slice(1)}`,
    title: id,
    description: '',
    criteria: [],
    statusId: 's',
    priority: 0,
    labels: [],
    parentId,
    createdAt: 0,
    updatedAt: 0,
    revision: 1
  }
}

function session(id: string, taskId: string, openedAt: number): LocalTaskSessionLink {
  return {
    id,
    taskId,
    hostId: 'local',
    worktreeId: 'shop::/w/shop-12',
    instanceId: null,
    surface: 'terminal',
    tabId: id,
    paneKey: null,
    sessionId: null,
    providerSession: null,
    agent: 'claude',
    linkedVia: 'start',
    openedAt
  }
}

// SHOP-12 has the workspace; SHOP-13 works in it, SHOP-14 has a workspace of its own.
const tasks = [task('t12', null), task('t13', 't12'), task('t14', 't12')]
const links: LocalTaskLinks = {
  workspaces: [
    {
      taskId: 't12',
      hostId: 'local',
      kind: 'git-worktree',
      instanceId: null,
      worktreeId: 'shop::/w/shop-12',
      folderWorkspaceId: null,
      repoId: 'shop',
      branchSnapshot: null,
      nameSnapshot: 'shop-12',
      hostLabelSnapshot: null,
      linkedVia: 'start',
      linkedAt: 1
    },
    {
      taskId: 't14',
      hostId: 'local',
      kind: 'git-worktree',
      instanceId: null,
      worktreeId: 'shop::/w/shop-14',
      folderWorkspaceId: null,
      repoId: 'shop',
      branchSnapshot: null,
      nameSnapshot: 'shop-14',
      hostLabelSnapshot: null,
      linkedVia: 'start',
      linkedAt: 2
    }
  ],
  sessions: [session('a', 't12', 1), session('b', 't13', 2), session('c', 't14', 3)]
}
const snapshot: LocalTaskProgressSnapshot = {
  observedAt: 10,
  sessions: [
    { taskSessionId: 'a', state: 'working', lastMessage: null, stateSince: 1, unread: false },
    { taskSessionId: 'b', state: 'waiting', lastMessage: null, stateSince: 2, unread: false },
    { taskSessionId: 'c', state: 'done', lastMessage: null, stateSince: 3, unread: true }
  ],
  items: []
}
const index = buildLocalTaskIndex([], tasks)
function statesOf(taskId: string, inContact = true) {
  const row = index.tasksById.get(taskId)
  if (!row) {
    throw new Error(`no task ${taskId}`)
  }
  return localTaskRowSessionStates({ task: row, index, links, snapshot, inContact }).map(
    (entry) => entry.state
  )
}

describe('the session dots of a list row', () => {
  it('shows every session in its own workspace, not those of a subtask with its own', () => {
    expect(statesOf('t12')).toEqual(['working', 'waiting'])
    expect(statesOf('t14')).toEqual(['done'])
  })

  it('shows only the sessions a task opened when it works in its parent workspace', () => {
    expect(statesOf('t13')).toEqual(['waiting'])
  })

  it('claims no state out of contact, keeping the dots', () => {
    expect(statesOf('t12', false)).toEqual(['unverifiable', 'unverifiable'])
  })
})
