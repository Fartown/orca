import type { LocalTask } from '../../../shared/local-tasks/local-task-types'
import {
  buildLocalTaskIndex,
  isLocalTaskVisible
} from '../../../shared/local-tasks/local-task-grouping'
import { localTasksDomainStore } from './local-tasks-domain-store'
import { openLocalTaskPage } from './local-task-navigation'
import { EMPTY_LOCAL_TASK_FILTERS, localTaskPageStore } from './local-task-page-store'

export function openLocalTaskReceiptPreview(task: LocalTask): void {
  openLocalTaskPage()
  const page = localTaskPageStore.getState()
  const domain = localTasksDomainStore.getState()
  const index = buildLocalTaskIndex(domain.projects, domain.tasks)
  if (page.scopeProjectId !== task.projectId) {
    page.setScope(task.projectId)
  }
  if (page.view === 'needs-you' || page.view === 'dispatcher') {
    page.setView('all')
  }
  if (
    !isLocalTaskVisible(task, index, {
      view: 'all',
      filters: EMPTY_LOCAL_TASK_FILTERS,
      query: page.query
    })
  ) {
    page.setQuery('')
  }
  if (
    page.filters.needsYou ||
    !isLocalTaskVisible(task, index, { view: 'all', filters: page.filters, query: '' })
  ) {
    page.setFilters(EMPTY_LOCAL_TASK_FILTERS)
  }
  if (
    !isLocalTaskVisible(task, index, {
      view: page.view === 'needs-you' || page.view === 'dispatcher' ? 'all' : page.view,
      filters: EMPTY_LOCAL_TASK_FILTERS,
      query: ''
    })
  ) {
    page.setView('all')
  }
  if (
    page.layout === 'board' &&
    !page.showCanceledColumn &&
    index.projectsById.get(task.projectId)?.statuses.find((status) => status.id === task.statusId)
      ?.category === 'canceled'
  ) {
    page.setLayout('list')
  }
  page.openPreview(task.id)
}
