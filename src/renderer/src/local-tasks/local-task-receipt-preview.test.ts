import { beforeEach, expect, it, vi } from 'vitest'
import type { LocalTask, LocalTaskProject } from '../../../shared/local-tasks/local-task-types'
import { localTasksDomainStore } from './local-tasks-domain-store'
import { EMPTY_LOCAL_TASK_FILTERS, localTaskPageStore } from './local-task-page-store'

const openPage = vi.hoisted(() => vi.fn())
vi.mock('./local-task-navigation', () => ({ openLocalTaskPage: openPage }))

import { openLocalTaskReceiptPreview } from './local-task-receipt-preview'

const project: LocalTaskProject = {
  id: 'target-project',
  name: 'Target',
  prefix: 'T',
  aliases: [],
  statuses: [
    {
      id: 'started',
      projectId: 'target-project',
      name: 'Started',
      category: 'started',
      color: 'yellow',
      position: 0
    }
  ],
  repos: [],
  defaultRepoId: null,
  lastExecutionHostId: null,
  rules: { startMovesToInProgress: true, prMergedCompletes: false },
  createdAt: 0,
  updatedAt: 0,
  revision: 0
}
const task: LocalTask = {
  id: 'task-1',
  projectId: 'target-project',
  title: 'Fix preview',
  number: 1,
  ref: 'T-1',
  description: '',
  criteria: [],
  statusId: 'started',
  priority: 2,
  labels: ['ui'],
  parentId: null,
  createdAt: 0,
  updatedAt: 0,
  revision: 0
}

beforeEach(() => {
  openPage.mockClear()
  localTasksDomainStore.getState().openEndpoint('local')
  localTasksDomainStore.getState().writer('local').applyProjects([project])
  localTasksDomainStore.getState().writer('local').applyTasks([task])
  localTaskPageStore.setState({
    scopeProjectId: null,
    view: 'all',
    layout: 'list',
    query: '',
    filters: EMPTY_LOCAL_TASK_FILTERS,
    previewOpen: false,
    cursorTaskId: null,
    showCanceledColumn: false
  })
})

it('lands on a receipt task across project, status, query and filter barriers', () => {
  localTaskPageStore.setState({
    scopeProjectId: 'another-project',
    view: 'completed',
    query: 'no match',
    filters: { priorities: [1], labels: ['backend'], categories: ['completed'], needsYou: true }
  })
  openLocalTaskReceiptPreview(task)
  expect(localTaskPageStore.getState()).toMatchObject({
    scopeProjectId: 'target-project',
    view: 'all',
    query: '',
    filters: EMPTY_LOCAL_TASK_FILTERS,
    previewOpen: true,
    cursorTaskId: 'task-1'
  })
  expect(openPage).toHaveBeenCalledOnce()
})

it('keeps matching search and filters when opening the task', () => {
  const filters = {
    priorities: [2] as const,
    labels: ['ui'],
    categories: [] as [],
    needsYou: false
  }
  localTaskPageStore.setState({ query: 'Fix', filters: filters as never })
  openLocalTaskReceiptPreview(task)
  expect(localTaskPageStore.getState()).toMatchObject({ query: 'Fix', filters, previewOpen: true })
})
