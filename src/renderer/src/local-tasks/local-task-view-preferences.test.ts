import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { localTasksDomainStore } from './local-tasks-domain-store'
import { localTaskPageStore } from './local-task-page-store'
import { bindLocalTaskViewPreferences } from './local-task-view-preferences'

let release: () => void = () => {}

beforeEach(() => {
  localTasksDomainStore.setState(localTasksDomainStore.getInitialState())
  localTasksDomainStore.getState().openEndpoint('local')
  localTaskPageStore.setState(localTaskPageStore.getInitialState())
  release = bindLocalTaskViewPreferences()
})

afterEach(() => release())

describe('bindLocalTaskViewPreferences', () => {
  it('applies the grouping and sort stored in the task library', () => {
    localTasksDomainStore
      .getState()
      .applyHomePreferences({ taskPageGroupBy: 'project', taskPageSortBy: 'number' })
    expect(localTaskPageStore.getState().groupBy).toBe('project')
    expect(localTaskPageStore.getState().sortBy).toBe('number')
  })

  it('falls back to the defaults for a cleared or unknown value', () => {
    localTasksDomainStore.getState().applyHomePreferences({ taskPageGroupBy: 'priority' })
    localTasksDomainStore
      .getState()
      .applyHomePreferences({ taskPageGroupBy: null, taskPageSortBy: 'assignee' })
    expect(localTaskPageStore.getState().groupBy).toBe('status')
    expect(localTaskPageStore.getState().sortBy).toBe('updated')
  })
})
