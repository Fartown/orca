// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { LocalTaskProject } from '../../../../../shared/local-tasks/local-task-types'

const fixture = vi.hoisted(() => ({ updateProject: vi.fn(), refresh: vi.fn(async () => {}) }))
vi.mock('@/store', () => ({
  useAppStore: (select: (state: { projects: [] }) => unknown) => select({ projects: [] })
}))
vi.mock('@/local-tasks/local-tasks-runtime-client', () => ({
  localTasksClient: { updateProject: fixture.updateProject }
}))
vi.mock('@/local-tasks/local-tasks-sync', () => ({ localTasksSync: { refresh: fixture.refresh } }))

import { localTasksDomainStore } from '@/local-tasks/local-tasks-domain-store'
import { LocalTaskProjectSettings } from './LocalTaskProjectSettings'

const project: LocalTaskProject = {
  id: 'project-1',
  repos: ['orca-1'],
  name: 'Original',
  prefix: 'OLD',
  aliases: [],
  defaultRepoId: null,
  lastExecutionHostId: null,
  rules: { startMovesToInProgress: false, prMergedCompletes: false },
  statuses: [],
  createdAt: 1,
  updatedAt: 1,
  revision: 1
}

beforeEach(() => {
  fixture.updateProject.mockReset()
  fixture.refresh.mockReset()
  localTasksDomainStore.setState(localTasksDomainStore.getInitialState())
  localTasksDomainStore.getState().openEndpoint('local')
  localTasksDomainStore.getState().writer('local').applyProjects([project])
  fixture.updateProject.mockImplementation(
    async (input: { expectedRevision: number; name?: string; prefix?: string }) =>
      input.expectedRevision === 1
        ? { ok: false, code: 'stale' }
        : {
            ok: true,
            project: {
              ...project,
              name: input.name ?? project.name,
              prefix: input.prefix ?? project.prefix,
              revision: 3
            }
          }
  )
  fixture.refresh.mockImplementation(async () => {
    localTasksDomainStore
      .getState()
      .writer('local')
      .applyProjects([{ ...project, name: 'Remote', revision: 2 }])
  })
})

it('keeps a changed prefix draft when another device changes the prefix first', async () => {
  fixture.refresh.mockImplementationOnce(async () => {
    localTasksDomainStore
      .getState()
      .writer('local')
      .applyProjects([{ ...project, prefix: 'REM', revision: 2 }])
  })
  const view = render(<LocalTaskProjectSettings project={project} writable />)
  const input = screen.getAllByRole('textbox')[1]
  fireEvent.change(input, { target: { value: 'NEW' } })
  view.rerender(
    <LocalTaskProjectSettings project={{ ...project, prefix: 'REM', revision: 2 }} writable />
  )
  fireEvent.click(screen.getByRole('button', { name: 'Change prefix' }))
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
  expect(input).toHaveProperty('value', 'NEW')
  expect(fixture.updateProject.mock.calls[0][0]).toMatchObject({
    expectedRevision: 1,
    prefix: 'NEW'
  })
  fireEvent.click(screen.getByRole('button', { name: 'Overwrite with mine' }))
  await waitFor(() => expect(fixture.updateProject.mock.calls[1][0].expectedRevision).toBe(2))
})
afterEach(cleanup)

it('keeps a changed project name draft and rejects a stale revision until overwrite', async () => {
  const view = render(<LocalTaskProjectSettings project={project} writable />)
  const input = screen.getAllByRole('textbox')[0]
  fireEvent.change(input, { target: { value: 'Mine' } })
  view.rerender(
    <LocalTaskProjectSettings project={{ ...project, name: 'Remote', revision: 2 }} writable />
  )
  fireEvent.blur(input)
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
  expect(input.getAttribute('value')).toBe('Mine')
  expect(fixture.updateProject.mock.calls[0][0].expectedRevision).toBe(1)
  fireEvent.click(screen.getByRole('button', { name: 'Overwrite with mine' }))
  await waitFor(() => expect(fixture.updateProject.mock.calls[1][0].expectedRevision).toBe(2))
})
