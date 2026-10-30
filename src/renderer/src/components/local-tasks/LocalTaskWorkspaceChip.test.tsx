// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import type { LocalTaskProject } from '../../../../shared/local-tasks/local-task-types'
import { LOCAL_TASK_SOURCE_HIDDEN_PREFERENCE_KEY } from '../../../../shared/local-tasks/local-task-source-visibility'

const app = vi.hoisted(() => ({ openModal: vi.fn() }))

vi.mock('@/store', () => ({
  useAppStore: Object.assign((select: (state: Record<string, unknown>) => unknown) => select({}), {
    getState: () => ({ openModal: app.openModal, getKnownWorktreeById: () => undefined })
  })
}))
vi.mock('@/local-tasks/local-task-workspace-resolution', () => ({
  localTaskWorktreeHostId: () => 'local'
}))

import { LocalTaskWorkspaceMenuItem } from './LocalTaskWorkspaceChip'
import { localTasksDomainStore } from '@/local-tasks/local-tasks-domain-store'

const project: LocalTaskProject = {
  id: 'shop',
  name: 'Shop',
  prefix: 'SHOP',
  aliases: [],
  repos: [],
  defaultRepoId: null,
  lastExecutionHostId: null,
  rules: { startMovesToInProgress: true, prMergedCompletes: true },
  statuses: [],
  createdAt: 0,
  updatedAt: 0,
  revision: 0
}

beforeEach(() => {
  localTasksDomainStore.setState(localTasksDomainStore.getInitialState())
  localTasksDomainStore.getState().openEndpoint('local')
  const library = localTasksDomainStore.getState().writer('local')
  library.setConnection('live')
  library.setHostState('ready', null)
  library.applyProjects([])
})

afterEach(cleanup)

it('offers linking a workspace only once its host’s library holds a task project', () => {
  render(
    <DropdownMenu open>
      <DropdownMenuTrigger>Open</DropdownMenuTrigger>
      <DropdownMenuContent>
        <LocalTaskWorkspaceMenuItem worktree={{ id: 'wt-1', hostId: 'local' }} disabled={false} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
  expect(screen.queryByRole('menuitem', { name: 'Link to task…' })).toBeNull()

  act(() => localTasksDomainStore.getState().writer('local').applyProjects([project]))
  expect(screen.getByRole('menuitem', { name: 'Link to task…' })).toBeTruthy()

  act(() =>
    localTasksDomainStore
      .getState()
      .writer('local')
      .applyPreferences({ [LOCAL_TASK_SOURCE_HIDDEN_PREFERENCE_KEY]: '1' })
  )
  expect(screen.queryByRole('menuitem', { name: 'Link to task…' })).toBeNull()
})

it('opens Orca’s workspace details on its Local tasks tab', () => {
  localTasksDomainStore.getState().writer('local').applyProjects([project])
  render(
    <DropdownMenu open>
      <DropdownMenuTrigger>Open</DropdownMenuTrigger>
      <DropdownMenuContent>
        <LocalTaskWorkspaceMenuItem worktree={{ id: 'wt-1', hostId: 'local' }} disabled={false} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
  fireEvent.click(screen.getByRole('menuitem', { name: 'Link to task…' }))
  expect(app.openModal).toHaveBeenCalledWith('edit-meta', {
    worktreeId: 'wt-1',
    executionHostId: 'local',
    focus: 'links',
    localTaskTab: true
  })
})
