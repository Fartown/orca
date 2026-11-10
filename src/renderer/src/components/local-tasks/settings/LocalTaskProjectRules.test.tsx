// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { LocalTaskProject } from '../../../../../shared/local-tasks/local-task-types'

const fixture = vi.hoisted(() => ({ updateProject: vi.fn() }))
vi.mock('@/local-tasks/local-tasks-runtime-client', () => ({
  localTasksClient: { updateProject: fixture.updateProject }
}))

import { LocalTaskProjectRules } from './LocalTaskProjectRules'

const project: LocalTaskProject = {
  id: 'project-1',
  repos: [],
  name: 'Shop',
  prefix: 'SHOP',
  aliases: [],
  defaultRepoId: null,
  lastExecutionHostId: null,
  rules: { startMovesToInProgress: true, prMergedCompletes: false, prMergedMode: 'review' },
  statuses: [],
  createdAt: 1,
  updatedAt: 1,
  revision: 4
}

beforeEach(() => {
  fixture.updateProject.mockReset()
  fixture.updateProject.mockImplementation(async () => ({ ok: true, project }))
})
afterEach(cleanup)

it('writes the chosen PR-merged outcome as the three-way mode', async () => {
  render(<LocalTaskProjectRules project={project} writable />)
  fireEvent.click(screen.getByRole('radio', { name: 'Move to completed' }))
  await waitFor(() => expect(fixture.updateProject).toHaveBeenCalledTimes(1))
  expect(fixture.updateProject.mock.calls[0][0]).toEqual({
    projectId: 'project-1',
    expectedRevision: 4,
    rules: { prMergedMode: 'completed' }
  })
})

it('offers a host without acceptance mode only its on/off rule, written as the old flag', async () => {
  const legacy = {
    ...project,
    rules: { startMovesToInProgress: true, prMergedCompletes: true }
  }
  render(<LocalTaskProjectRules project={legacy} writable />)
  expect(screen.queryByRole('radio', { name: 'Move to acceptance' })).toBeNull()
  fireEvent.click(screen.getByRole('radio', { name: 'Leave as is' }))
  await waitFor(() => expect(fixture.updateProject).toHaveBeenCalledTimes(1))
  expect(fixture.updateProject.mock.calls[0][0].rules).toEqual({ prMergedCompletes: false })
})
