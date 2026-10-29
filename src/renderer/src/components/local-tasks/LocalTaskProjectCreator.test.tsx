// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => {
  const setup = (projectId: string, hostId: string) => ({
    id: `setup-${projectId}`,
    projectId,
    hostId,
    repoId: projectId,
    setupState: 'ready'
  })
  return {
    state: {
      projects: [
        { id: 'one', displayName: 'One' },
        { id: 'two', displayName: 'Two' },
        { id: 'three', displayName: 'Three' }
      ],
      repos: [],
      projectHostSetups: [
        setup('one', 'local'),
        setup('two', 'ssh:minizc'),
        setup('three', 'runtime:env-build')
      ],
      // The focused server holds none of these projects, so nothing may land in its library.
      settings: { activeRuntimeEnvironmentId: 'env-focused' },
      runtimeEnvironments: [
        { id: 'env-focused', name: 'Focused server' },
        { id: 'env-build', name: 'Build server' }
      ],
      sshTargetLabels: new Map([['minizc', 'Mini']]),
      removedSshTargetLabels: new Map()
    },
    createProject: vi.fn()
  }
})
vi.mock('@/store', () => ({
  useAppStore: Object.assign((select: (value: unknown) => unknown) => select(fixture.state), {
    getState: () => fixture.state
  })
}))
vi.mock('@/local-tasks/local-tasks-runtime-client', () => ({
  localTasksClient: { createProject: fixture.createProject }
}))

import { LocalTaskProjectCreator } from './LocalTaskProjectCreator'
import { LocalTaskPage } from './LocalTaskPage'
import { LocalTasksSettingsPane } from './settings/LocalTasksSettingsPane'
import { localTasksDomainStore } from '@/local-tasks/local-tasks-domain-store'

beforeEach(() => {
  fixture.createProject.mockReset()
  localTasksDomainStore.setState(localTasksDomainStore.getInitialState())
  for (const endpoint of ['local', 'runtime:env-focused', 'runtime:env-build'] as const) {
    localTasksDomainStore.getState().openEndpoint(endpoint)
    const library = localTasksDomainStore.getState().writer(endpoint)
    library.setConnection('live')
    library.setHostState('ready', null)
    library.applyProjects([])
    library.applyTasks([])
  }
  fixture.createProject.mockImplementation(
    async (_endpoint: string, input: { prefix: string; repos: string[] }) =>
      input.prefix === 'DUP'
        ? { ok: false, code: 'prefix_taken', detail: 'One' }
        : {
            ok: true,
            project: {
              id: `task-${input.repos[0]}`,
              repos: input.repos,
              defaultRepoId: input.repos[0],
              name: input.repos[0] === 'one' ? 'One' : 'Two',
              prefix: input.prefix,
              aliases: [],
              rules: { startMovesToInProgress: true, prMergedCompletes: true },
              statuses: [],
              revision: 1
            }
          }
  )
})
afterEach(cleanup)

it('names each project’s own hosts and creates it in the library serving them, not the focused one', async () => {
  render(<LocalTaskProjectCreator writable />)
  expect(screen.getByText('Mini')).toBeTruthy()
  expect(screen.getByText('Build server')).toBeTruthy()
  expect(screen.queryByText('Focused server')).toBeNull()
  for (const name of ['One', 'Two', 'Three']) {
    fireEvent.click(screen.getByRole('checkbox', { name }))
  }
  fireEvent.click(screen.getByRole('button', { name: 'Create selected (3)' }))
  await waitFor(() => expect(fixture.createProject).toHaveBeenCalledTimes(3))
  expect(
    fixture.createProject.mock.calls.map(([endpoint, input]) => [input.repos[0], endpoint])
  ).toEqual([
    ['one', 'local'],
    ['two', 'local'],
    ['three', 'runtime:env-build']
  ])
})

it('retains failed rows for correction and retries only projects not already created', async () => {
  const done = vi.fn()
  render(<LocalTaskProjectCreator writable onDone={done} />)
  fireEvent.click(screen.getByRole('checkbox', { name: 'One' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Two' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Prefix for Two' }), {
    target: { value: 'DUP' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Create selected (2)' }))
  await waitFor(() => expect(fixture.createProject).toHaveBeenCalledTimes(2))
  expect(done).not.toHaveBeenCalled()
  expect(screen.getByText(/One.*prefix/i)).toBeTruthy()
  expect(screen.queryByRole('checkbox', { name: 'One' })).toBeNull()

  fireEvent.change(screen.getByRole('textbox', { name: 'Prefix for Two' }), {
    target: { value: 'FIX' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Create selected (1)' }))
  await waitFor(() => expect(done).toHaveBeenCalledTimes(1))
  expect(fixture.createProject.mock.calls.map(([, input]) => input.repos[0])).toEqual([
    'one',
    'two',
    'two'
  ])
})

it('keeps the initial setup visible when its first project succeeds but another fails', async () => {
  render(<LocalTaskPage sourceBar={null} />)
  fireEvent.click(screen.getByRole('checkbox', { name: 'One' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Two' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Prefix for Two' }), {
    target: { value: 'DUP' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Create selected (2)' }))
  await waitFor(() => expect(fixture.createProject).toHaveBeenCalledTimes(2))
  expect(screen.getByRole('textbox', { name: 'Prefix for Two' })).toBeTruthy()
  expect(screen.getByRole('textbox', { name: 'Prefix for Two' }).getAttribute('aria-invalid')).toBe(
    'true'
  )
})

it('keeps the settings dialog open for a failed row after another project succeeds', async () => {
  render(<LocalTasksSettingsPane />)
  fireEvent.click(screen.getByRole('button', { name: 'New task project' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'One' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Two' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Prefix for Two' }), {
    target: { value: 'DUP' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Create selected (2)' }))
  await waitFor(() => expect(fixture.createProject).toHaveBeenCalledTimes(2))
  expect(screen.getByRole('dialog')).toBeTruthy()
  expect(screen.getByRole('textbox', { name: 'Prefix for Two' }).getAttribute('aria-invalid')).toBe(
    'true'
  )
})
