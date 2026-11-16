// @vitest-environment happy-dom
import { beforeEach, expect, it } from 'vitest'
import { localTaskPageStore } from './local-task-page-store'
import { readLocalTaskNavExpanded } from './local-task-nav-preference'

beforeEach(() => {
  localStorage.clear()
  localTaskPageStore.setState(localTaskPageStore.getInitialState(), true)
})

it('keeps a manual navigation choice across scope, view, and layout changes', () => {
  const page = localTaskPageStore.getState()
  page.setNavExpanded(false)
  page.setScope('project-1')
  page.setView('started')
  page.setLayout('board')
  expect(localTaskPageStore.getState().navExpanded).toBe(false)
  expect(readLocalTaskNavExpanded()).toBe(false)
  page.setNavExpanded(true)
  expect(readLocalTaskNavExpanded()).toBe(true)
})
