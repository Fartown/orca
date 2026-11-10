import { describe, expect, it } from 'vitest'
import { buildLocalTaskIndex } from '../../../src/shared/local-tasks/local-task-grouping'
import type {
  LocalTaskLinks,
  LocalTaskProgressSnapshot,
  LocalTaskSessionLink
} from '../../../src/shared/local-tasks/local-task-link-types'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import { localTaskCardFacts } from './local-task-card-facts'

function task(id: string, parentId: string | null = null): LocalTask {
  return {
    id,
    projectId: 'p',
    number: Number(id.replace(/\D/g, '')) || 1,
    ref: `ORC-${id}`,
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

function session(id: string, taskId: string, openedAt: number): LocalTaskSessionLink {
  return {
    id,
    taskId,
    hostId: 'ssh:dbox',
    worktreeId: 'wt',
    instanceId: null,
    surface: 'terminal',
    tabId: null,
    paneKey: null,
    sessionId: null,
    providerSession: null,
    agent: 'claude',
    linkedVia: 'start',
    openedAt
  }
}

const parent = task('41')
const child = task('43', '41')
const links: LocalTaskLinks = {
  workspaces: [
    {
      taskId: parent.id,
      hostId: 'ssh:dbox',
      kind: 'git-worktree',
      instanceId: null,
      worktreeId: 'wt',
      folderWorkspaceId: null,
      repoId: 'repo',
      branchSnapshot: 'feat-reconnect',
      nameSnapshot: 'feat-reconnect',
      hostLabelSnapshot: 'dbox (recorded)',
      linkedVia: 'start',
      linkedAt: 1
    }
  ],
  sessions: [session('own', parent.id, 1), session('kid', child.id, 2)]
}

function facts(snapshot: LocalTaskProgressSnapshot, tasks: LocalTask[] = [parent, child]) {
  return localTaskCardFacts({
    task: tasks[0]!,
    index: buildLocalTaskIndex([], tasks),
    links,
    snapshot,
    inContact: true,
    hostName: (hostId, recorded) => (hostId === 'ssh:dbox' ? 'dbox' : (recorded ?? '')),
    hostConnected: () => null
  })
}

describe('localTaskCardFacts', () => {
  it('names the session waiting on the user first and sums up the subtasks', () => {
    const result = facts({
      observedAt: 10,
      sessions: [
        { taskSessionId: 'own', state: 'working', lastMessage: null, stateSince: 5, unread: false },
        {
          taskSessionId: 'kid',
          state: 'waiting',
          lastMessage: 'Top?',
          stateSince: 6,
          unread: false
        }
      ],
      items: [
        {
          key: 'kid@6',
          taskId: child.id,
          taskSessionId: 'kid',
          kind: 'question',
          agent: 'claude',
          lastMessage: 'Top?',
          since: 6,
          replyable: false
        }
      ]
    })
    expect(result.lead?.link.id).toBe('kid')
    expect(result.subtasks?.summary).toEqual({ kind: 'waiting', count: 1 })
    expect(result.offline).toBe(false)
    expect(result.hostName).toBe('dbox')
  })

  it('says the host is not connected when every session there is unverifiable, keeping the last writeback', () => {
    const written = {
      ...parent,
      latestProgress: {
        kind: 'progress' as const,
        body: 'Found it.\nNext: test',
        at: 3,
        sessionLinkId: null
      }
    }
    const result = facts(
      {
        observedAt: 10,
        sessions: ['own', 'kid'].map((id) => ({
          taskSessionId: id,
          state: 'unverifiable' as const,
          lastMessage: null,
          stateSince: null,
          unread: false
        })),
        items: []
      },
      [written, child]
    )
    expect(result.offline).toBe(true)
    expect(result.latest).toEqual({
      source: 'writeback',
      body: 'Found it. Next: test',
      at: 3,
      fromRef: null
    })
  })
})
