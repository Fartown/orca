// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { localTasksDomainStore } from '@/local-tasks/local-tasks-domain-store'
import { LocalTaskPage } from './LocalTaskPage'
import { LocalTasksSettingsPane } from './settings/LocalTasksSettingsPane'

const library = () => localTasksDomainStore.getState().writer('local')

beforeEach(() => {
  localTasksDomainStore.setState(localTasksDomainStore.getInitialState())
  localTasksDomainStore.getState().openEndpoint('local')
  library().setConnection('live')
  library().setHostState('ready', null)
  library().applyTasks([])
  library().setReadError('projects', 'projects read failed')
})
afterEach(cleanup)

it('shows a failed first project read and exposes a manual retry instead of indefinite loading', () => {
  render(<LocalTaskPage sourceBar={null} />)
  expect(screen.getByRole('alert')).toBeTruthy()
  expect(screen.queryByText('Loading tasks…')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(localTasksDomainStore.getState().subscriptionEpoch).toBe(0)
  expect(localTasksDomainStore.getState().readErrors.projects).toBe('projects read failed')
})

it('shows the same project read failure in settings', () => {
  render(<LocalTasksSettingsPane />)
  expect(screen.getByRole('alert')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
  expect(screen.queryByText('No task projects yet.')).toBeNull()
})

it('shows a failed status read even before the host becomes readable', () => {
  library().setHostState('starting', null)
  library().setReadError('status', 'status read failed')
  render(<LocalTaskPage sourceBar={null} />)
  expect(screen.getByRole('alert')).toBeTruthy()
  expect(screen.queryByText('Opening the task library…')).toBeNull()
})
