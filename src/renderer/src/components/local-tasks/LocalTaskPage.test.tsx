// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const rpc = vi.hoisted(() => ({ call: vi.fn(async () => []) }))
vi.mock('@/runtime/runtime-rpc-client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  callRuntimeRpc: rpc.call
}))

import { useAppStore } from '@/store'
import { localTasksDomainStore } from '@/local-tasks/local-tasks-domain-store'
import { LocalTaskPage } from './LocalTaskPage'
import { LocalTasksSettingsPane } from './settings/LocalTasksSettingsPane'

const library = () => localTasksDomainStore.getState().writer('local')

const PAIRED = 'runtime:env-1'

beforeEach(() => {
  rpc.call.mockClear()
  useAppStore.setState({
    runtimeEnvironments: [
      {
        id: 'env-1',
        name: 'Studio',
        createdAt: 1,
        updatedAt: 1,
        lastUsedAt: null,
        runtimeId: null,
        endpoints: [],
        preferredEndpointId: 'endpoint'
      }
    ]
  })
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
  expect(screen.queryByText('No projects yet.')).toBeNull()
})

it('shows a failed status read even before the host becomes readable', () => {
  library().setHostState('starting', null)
  library().setReadError('status', 'status read failed')
  render(<LocalTaskPage sourceBar={null} />)
  expect(screen.getByRole('alert')).toBeTruthy()
  expect(screen.queryByText('Opening the task library…')).toBeNull()
})

it('offers a retry once this app’s own stream failed, and only the click opens it again', () => {
  library().setConnection('failed', 'socket closed')
  render(<LocalTaskPage sourceBar={null} />)
  expect(screen.getByText('Could not reach the task library.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(localTasksDomainStore.getState()).toMatchObject({
    connection: 'connecting',
    subscriptionEpoch: 1
  })
})

function openPairedLibrary(): ReturnType<typeof library> {
  library().setReadError('projects', null)
  localTasksDomainStore.getState().openEndpoint(PAIRED)
  const paired = localTasksDomainStore.getState().writer(PAIRED)
  paired.setConnection('live')
  paired.setHostState('ready', null)
  return paired
}

it('reports a paired Orca’s failed read on its own line and retries only that library', () => {
  openPairedLibrary().setReadError('tasks', 'tasks read failed')
  render(<LocalTaskPage sourceBar={null} />)
  expect(localTasksDomainStore.getState().readErrors).toEqual({})
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByText('Could not read the tasks on Studio.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(rpc.call.mock.calls).toEqual([
    [{ kind: 'environment', environmentId: 'env-1' }, 'localTasks.tasks.list', {}]
  ])
})

it.each([
  ['unavailable', 'Studio: its task library cannot be opened right now'],
  ['read-only', 'Studio: read only.']
] as const)('says why a paired library that is %s shows no or frozen tasks', (state, text) => {
  openPairedLibrary().setHostState(state, null)
  render(<LocalTaskPage sourceBar={null} />)
  expect(screen.getByText(new RegExp(text))).toBeTruthy()
})
