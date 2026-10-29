// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import type { LocalTaskProject } from '../../../../shared/local-tasks/local-task-types'

vi.mock('@/store', () => ({
  useAppStore: (select: (state: Record<string, unknown>) => unknown) => select({})
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
})
