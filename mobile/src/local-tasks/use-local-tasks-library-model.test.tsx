import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  LocalTaskSessionLink,
  LocalTaskWorkspaceLink
} from '../../../src/shared/local-tasks/local-task-link-types'
import type { LocalTask, LocalTaskProject } from '../../../src/shared/local-tasks/local-task-types'
import type { RpcClient } from '../transport/rpc-client'
import type * as LocalTaskGroupingModule from '../../../src/shared/local-tasks/local-task-grouping'

const indexBuilds = vi.hoisted(() => ({ count: 0 }))
vi.mock('../../../src/shared/local-tasks/local-task-grouping', async (original) => {
  const actual = await original<typeof LocalTaskGroupingModule>()
  return {
    ...actual,
    buildLocalTaskIndex: (...args: Parameters<typeof actual.buildLocalTaskIndex>) => {
      indexBuilds.count += 1
      return actual.buildLocalTaskIndex(...args)
    }
  }
})
vi.mock('./use-local-task-card-context', () => ({
  useLocalTaskCardContext: () => ({
    context: { hostName: () => '', hostConnected: () => null, reviewDetail: () => null },
    connected: new Map()
  })
}))

import { SELF_LOCAL_TASK_ENDPOINT } from './local-task-endpoint'
import { EMPTY_LOCAL_TASK_FILTER } from './local-task-filter'
import type { LocalTasksLibrary } from './use-local-tasks-library'
import { useLocalTasksLibraryModel } from './use-local-tasks-library-model'

const project = {
  id: 'p',
  name: 'Shop',
  prefix: 'SHOP',
  aliases: [],
  repos: [],
  defaultRepoId: null,
  lastExecutionHostId: null,
  rules: { startMovesToInProgress: false, prMergedCompletes: false },
  statuses: [
    {
      id: 'started',
      projectId: 'p',
      name: 'In Progress',
      category: 'started',
      color: 'yellow',
      position: 0
    }
  ],
  createdAt: 0,
  updatedAt: 0,
  revision: 1
} satisfies LocalTaskProject

function task(id: string, number: number, parentId: string | null): LocalTask {
  return {
    id,
    projectId: project.id,
    number,
    ref: `SHOP-${number}`,
    title: id,
    description: '',
    criteria: [],
    statusId: 'started',
    priority: 0,
    labels: [],
    parentId,
    createdAt: 0,
    updatedAt: 0,
    revision: 1
  }
}

/** `count` tasks, each working in its own workspace through a subtask's chat. */
function libraryOf(count: number): LocalTasksLibrary {
  const tasks: LocalTask[] = []
  const workspaces: LocalTaskWorkspaceLink[] = []
  const sessions: LocalTaskSessionLink[] = []
  for (let at = 0; at < count; at += 1) {
    const parent = task(`parent-${at}`, at * 2 + 1, null)
    const child = task(`child-${at}`, at * 2 + 2, parent.id)
    tasks.push(parent, child)
    workspaces.push({
      taskId: parent.id,
      hostId: 'local',
      kind: 'git-worktree',
      instanceId: null,
      worktreeId: `wt-${at}`,
      folderWorkspaceId: null,
      repoId: 'repo',
      branchSnapshot: null,
      nameSnapshot: null,
      hostLabelSnapshot: null,
      linkedVia: 'start',
      linkedAt: 1
    })
    sessions.push({
      id: `session-${at}`,
      taskId: child.id,
      hostId: 'local',
      worktreeId: `wt-${at}`,
      instanceId: null,
      surface: 'chat',
      tabId: null,
      paneKey: null,
      sessionId: `agent-${at}`,
      providerSession: null,
      agent: 'claude',
      linkedVia: 'start',
      openedAt: at
    })
  }
  return {
    api: null,
    tasks,
    projects: [project],
    status: null,
    loaded: true,
    error: null,
    eventsVersion: 0,
    live: true,
    streamEnded: false,
    work: {
      links: { workspaces, sessions },
      progress: {
        observedAt: 1,
        sessions: sessions.map((session) => ({
          taskSessionId: session.id,
          state: 'working',
          lastMessage: `${session.taskId} is on it`,
          stateSince: 1,
          unread: false
        })),
        items: []
      },
      error: null
    },
    acceptTasks: () => {},
    reload: () => {},
    retryFailed: () => {},
    resubscribe: () => {}
  }
}

const client: RpcClient = {
  sendRequest: async () => ({ id: 'test', ok: true, result: {} }),
  subscribe: () => () => {},
  updateTerminalSubscriptionViewport: () => {},
  getState: () => 'connected',
  getReconnectAttempt: () => 0,
  getLastConnectedAt: () => null,
  onStateChange: () => () => {},
  notifyForeground: () => {},
  close: () => {}
}

let renderer: ReactTestRenderer | null = null
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
})

/** Draws the board once: every card asks for its dots and its latest line. */
function drawBoard(library: LocalTasksLibrary) {
  const cards: { id: string; line: string | null; dots: string[] }[] = []
  function Board() {
    const model = useLocalTasksLibraryModel({
      site: {
        hostId: 'host-1',
        pairedClient: client,
        client,
        endpoint: SELF_LOCAL_TASK_ENDPOINT,
        connState: 'connected',
        capabilities: [],
        label: 'Desktop'
      },
      library,
      projectId: null,
      segment: 'all',
      view: 'board',
      filter: EMPTY_LOCAL_TASK_FILTER
    })
    cards.length = 0
    for (const group of model.groups) {
      for (const row of group.rows) {
        cards.push({
          id: row.task.id,
          line: model.latestLineFor(row.task),
          dots: model.sessionsFor(row.task).map((dot) => `${dot.id}:${dot.state}`)
        })
      }
    }
    return null
  }
  indexBuilds.count = 0
  act(() => {
    renderer?.unmount()
    renderer = create(createElement(Board))
  })
  return { cards, indexBuilds: indexBuilds.count }
}

describe("the library board's cards", () => {
  it('index the library once per draw, however many cards there are', () => {
    const few = drawBoard(libraryOf(5))
    const many = drawBoard(libraryOf(300))
    expect(many.cards).toHaveLength(600)
    expect(many.indexBuilds).toBe(few.indexBuilds)
  })

  it("still show a subtask's session on the task whose workspace it runs in", () => {
    const { cards } = drawBoard(libraryOf(3))
    expect(cards.find((card) => card.id === 'parent-1')).toEqual({
      id: 'parent-1',
      line: 'child-1 is on it',
      dots: ['session-1:working']
    })
    expect(cards.find((card) => card.id === 'child-1')).toEqual({
      id: 'child-1',
      line: 'child-1 is on it',
      dots: ['session-1:working']
    })
  })
})
