import { beforeEach, expect, it } from 'vitest'
import type {
  LocalTaskAttentionItem,
  LocalTaskSessionLink
} from '../../../shared/local-tasks/local-task-link-types'
import type { LocalTask } from '../../../shared/local-tasks/local-task-types'
import { isLocalTaskRowWritable, localTasksDomainStore } from './local-tasks-domain-store'

const REMOTE = 'runtime:env-1'

const task: LocalTask = {
  id: 'task-1',
  projectId: 'project-1',
  number: 1,
  ref: 'ONE-1',
  title: 'Current',
  description: '',
  criteria: [],
  statusId: 'status-1',
  priority: 0,
  labels: [],
  parentId: null,
  createdAt: 1,
  updatedAt: 1,
  revision: 5
}

function session(id: string): LocalTaskSessionLink {
  return {
    id,
    taskId: 'task-1',
    hostId: 'local',
    worktreeId: 'repo::/w',
    instanceId: null,
    surface: 'terminal',
    tabId: 'tab',
    paneKey: null,
    sessionId: null,
    providerSession: null,
    agent: 'claude',
    linkedVia: 'start',
    openedAt: 1
  }
}

function item(taskSessionId: string, since: number): LocalTaskAttentionItem {
  return {
    key: `tab:leaf@${since}`,
    taskId: 'task-1',
    taskSessionId,
    kind: 'unread-done',
    agent: 'claude',
    lastMessage: 'done',
    since,
    replyable: true
  }
}

const library = (endpoint: 'local' | typeof REMOTE) =>
  localTasksDomainStore.getState().writer(endpoint)

beforeEach(() => {
  localTasksDomainStore.setState(localTasksDomainStore.getInitialState())
  localTasksDomainStore.getState().openEndpoint('local')
  localTasksDomainStore.getState().openEndpoint(REMOTE)
})

it('keeps a newer local task against an older read or write response', () => {
  localTasksDomainStore.getState().upsertTasks([task], { created: true })
  library('local').applyTasks([{ ...task, title: 'Old read', revision: 4 }])
  expect(localTasksDomainStore.getState().tasks[0]).toEqual(task)
  localTasksDomainStore.getState().upsertTasks([{ ...task, title: 'Old write', revision: 3 }])
  expect(localTasksDomainStore.getState().tasks[0]).toEqual(task)
})

it('does not revive a task removed elsewhere when a late edit reply arrives', () => {
  library('local').applyTasks([task])
  library('local').applyTasks([])
  localTasksDomainStore.getState().upsertTasks([{ ...task, title: 'Late edit', revision: 6 }])
  expect(localTasksDomainStore.getState().tasks).toEqual([])
})

it('files a write result under the library its id names', () => {
  const remote = { ...task, id: `${REMOTE}/task-1`, projectId: `${REMOTE}/project-1` }
  localTasksDomainStore.getState().upsertTasks([task, remote], { created: true })
  const [own, paired] = localTasksDomainStore.getState().partitions
  expect(own?.tasks.map((row) => row.id)).toEqual(['task-1'])
  expect(paired?.tasks.map((row) => row.id)).toEqual([`${REMOTE}/task-1`])
  expect(localTasksDomainStore.getState().tasks).toHaveLength(2)
})

it('reads a library out of contact as unverifiable and leaves its items out', () => {
  const remoteSession = `${REMOTE}/s-2`
  library('local').applyLinks({ workspaces: [], sessions: [session('s-1')] })
  library('local').applyProgress({
    observedAt: 1,
    sessions: [
      { taskSessionId: 's-1', state: 'done', lastMessage: 'ok', stateSince: 1, unread: true }
    ],
    items: [item('s-1', 1)]
  })
  library(REMOTE).applyLinks({ workspaces: [], sessions: [session(remoteSession)] })
  library(REMOTE).applyProgress({
    observedAt: 1,
    sessions: [
      {
        taskSessionId: remoteSession,
        state: 'waiting',
        lastMessage: 'May I run it?',
        stateSince: 2,
        unread: false
      }
    ],
    items: [item(remoteSession, 2)]
  })
  expect(localTasksDomainStore.getState().progress?.items.map((row) => row.since)).toEqual([2, 1])

  localTasksDomainStore.getState().setEndpointContact(REMOTE, false)
  const progress = localTasksDomainStore.getState().progress
  expect(progress?.items.map((row) => row.taskSessionId)).toEqual(['s-1'])
  expect(progress?.sessions.get(remoteSession)).toMatchObject({
    state: 'unverifiable',
    lastMessage: 'May I run it?'
  })
  expect(progress?.sessions.get('s-1')?.state).toBe('done')
  expect(progress?.unverifiable).toBe(true)
})

it('takes writes for a row only while its own library is live, ready and in contact', () => {
  library(REMOTE).setConnection('live')
  library(REMOTE).setHostState('ready', null)
  expect(isLocalTaskRowWritable(localTasksDomainStore.getState(), `${REMOTE}/task-1`)).toBe(true)
  expect(isLocalTaskRowWritable(localTasksDomainStore.getState(), 'task-1')).toBe(false)
  localTasksDomainStore.getState().setEndpointContact(REMOTE, false)
  expect(isLocalTaskRowWritable(localTasksDomainStore.getState(), `${REMOTE}/task-1`)).toBe(false)
})
