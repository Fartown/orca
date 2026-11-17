// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { LocalTaskSessionLink } from '../../../../shared/local-tasks/local-task-link-types'
import type { LocalTask, LocalTaskProject } from '../../../../shared/local-tasks/local-task-types'

const mocks = vi.hoisted(() => ({
  reply: vi.fn(),
  openDialog: vi.fn(),
  start: vi.fn()
}))

vi.mock('@/local-tasks/local-task-writes', () => ({
  runLocalTaskWrite: async (run: () => Promise<unknown>) => run(),
  updateLocalTaskFields: async () => true
}))
vi.mock('@/local-tasks/local-tasks-runtime-client', () => ({
  localTasksClient: { addComment: async () => ({ ok: true }) }
}))
vi.mock('@/local-tasks/local-task-needs-you-actions', () => ({ sendLocalTaskReply: mocks.reply }))
vi.mock('@/local-tasks/local-task-host-contact', () => ({
  isLocalTaskHostInContact: () => true,
  useLocalTaskHostInContact: () => true
}))
vi.mock('@/local-tasks/local-task-work-actions', () => ({ runLocalTaskStart: mocks.start }))
vi.mock('@/local-tasks/local-task-link-dialog-store', () => ({
  localTaskLinkDialogStore: { getState: () => ({ open: mocks.openDialog }) }
}))
vi.mock('@/local-tasks/local-task-session-launch', () => ({ localTaskPromptFor: () => 'brief' }))
vi.mock('./LocalTaskWorkspaceCard', () => ({ openLocalTaskWorkspaceChanges: vi.fn() }))
vi.mock('./use-local-task-workspace-diff', () => ({ useLocalTaskWorkspaceDiff: () => null }))

import { localTasksDomainStore } from '@/local-tasks/local-tasks-domain-store'
import { LocalTaskAcceptanceStrip } from './LocalTaskAcceptanceStrip'

const project: LocalTaskProject = {
  id: 'p',
  name: 'P',
  prefix: 'P',
  aliases: [],
  repos: [],
  defaultRepoId: null,
  lastExecutionHostId: null,
  rules: { startMovesToInProgress: true, prMergedCompletes: false },
  statuses: [
    {
      id: 'doing',
      projectId: 'p',
      name: 'Doing',
      category: 'started',
      color: 'yellow',
      position: 0
    },
    {
      id: 'review',
      projectId: 'p',
      name: 'Review',
      category: 'review',
      color: 'green',
      position: 1
    },
    { id: 'done', projectId: 'p', name: 'Done', category: 'completed', color: 'blue', position: 2 }
  ],
  createdAt: 0,
  updatedAt: 0,
  revision: 0
}

function task(id: string, statusId: string, parentId: string | null = null): LocalTask {
  return {
    id,
    projectId: 'p',
    number: 1,
    ref: id,
    title: id,
    description: '',
    criteria: [],
    statusId,
    priority: 0,
    labels: [],
    parentId,
    createdAt: 0,
    updatedAt: 0,
    revision: 0
  }
}

function session(id: string, taskId: string): LocalTaskSessionLink {
  return {
    id,
    taskId,
    hostId: 'local',
    worktreeId: 'wt',
    instanceId: null,
    surface: 'terminal',
    tabId: `tab-${id}`,
    paneKey: null,
    sessionId: null,
    providerSession: null,
    agent: 'claude',
    linkedVia: 'start',
    openedAt: 0
  }
}

const parent = task('parent', 'review')

beforeEach(() => {
  mocks.reply.mockReset().mockResolvedValue({ status: 'sent' })
  mocks.openDialog.mockReset()
  mocks.start.mockReset()
  localTasksDomainStore.setState(localTasksDomainStore.getInitialState(), true)
  localTasksDomainStore.setState({
    tasks: [parent, task('child', 'doing', 'parent')],
    links: { workspaces: [], sessions: [session('s-child', 'child')] },
    progress: {
      sessions: new Map([
        [
          's-child',
          {
            taskSessionId: 's-child',
            state: 'done',
            lastMessage: null,
            stateSince: null,
            unread: true
          }
        ]
      ]),
      items: [],
      unverifiable: false
    }
  })
})
afterEach(cleanup)

it('sends the reason to a subtask session that finished a turn instead of opening a new one', async () => {
  render(<LocalTaskAcceptanceStrip task={parent} project={project} writable />)
  fireEvent.click(screen.getByRole('button', { name: 'Send back' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'What needs to change?' }), {
    target: { value: 'The export drops the header row' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Send back to the sessions' }))
  await waitFor(() => expect(mocks.reply).toHaveBeenCalledOnce())
  expect(mocks.reply.mock.calls[0]?.[0].id).toBe('s-child')
  expect(mocks.reply.mock.calls[0]?.[1]).toBe('The export drops the header row')
  expect(mocks.openDialog).not.toHaveBeenCalled()
  expect(mocks.start).not.toHaveBeenCalled()
})
