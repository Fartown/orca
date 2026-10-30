// @vitest-environment happy-dom
import type { ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalTask, LocalTaskProject } from '../../../../shared/local-tasks/local-task-types'
import type { LocalTaskWorkspaceLink } from '../../../../shared/local-tasks/local-task-link-types'
import type { WorkspaceAttachment } from '../../../../shared/worktree/types'

const fixture = vi.hoisted(() => ({ setPreference: vi.fn(), openLocalTaskPage: vi.fn() }))

vi.mock('@/store', async () => {
  const { createTestStore } = await import('@/store/slices/store-test-helpers')
  return { useAppStore: createTestStore() }
})
vi.mock('@/local-tasks/local-tasks-runtime-client', () => ({
  localTasksClient: { setPreference: fixture.setPreference }
}))
vi.mock('@/local-tasks/local-task-navigation', () => ({
  openLocalTaskPage: fixture.openLocalTaskPage
}))
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: () => null
}))
vi.mock('@/components/SelectedTextCopyMenu', () => ({
  SelectedTextCopyMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))
vi.mock('@/components/ui/hover-card', () => ({
  HoverCard: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  HoverCardTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  HoverCardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { WorktreeCardDetailsHover } from '@/components/sidebar/WorktreeCardMeta'
import { useWorktreeCardDetailsHoverControl } from '@/components/sidebar/worktree-card-details-hover-state'
import { makeWorktree } from '@/store/slices/worktrees-slice-test-fixtures'
import { localTasksDomainStore } from '@/local-tasks/local-tasks-domain-store'
import { LocalTaskCardOptionItem } from './LocalTaskCardOptionItem'
import { LocalTaskWorkspaceChip } from './LocalTaskWorkspaceChip'

const WORKSPACE_ID = 'repo::/repo/feature'

const project: LocalTaskProject = {
  id: 'shop',
  name: 'Shop',
  prefix: 'SHOP',
  aliases: [],
  repos: [],
  defaultRepoId: null,
  lastExecutionHostId: null,
  rules: { startMovesToInProgress: true, prMergedCompletes: true },
  statuses: [
    {
      id: 'doing',
      projectId: 'shop',
      category: 'started',
      name: 'In Progress',
      color: 'yellow',
      position: 0
    }
  ],
  createdAt: 0,
  updatedAt: 0,
  revision: 0
}

const task: LocalTask = {
  id: 'task-12',
  projectId: 'shop',
  number: 12,
  ref: 'SHOP-12',
  title: 'Export orders as CSV',
  description: '',
  criteria: [],
  statusId: 'doing',
  priority: 0,
  labels: [],
  parentId: null,
  createdAt: 0,
  updatedAt: 0,
  revision: 0
}

const link: LocalTaskWorkspaceLink = {
  taskId: 'task-12',
  hostId: 'local',
  kind: 'git-worktree',
  instanceId: null,
  worktreeId: WORKSPACE_ID,
  folderWorkspaceId: null,
  repoId: 'repo',
  branchSnapshot: 'feature',
  nameSnapshot: 'feature',
  hostLabelSnapshot: null,
  linkedVia: 'manual',
  linkedAt: 0
}

const linearIssue = {
  provider: 'linear',
  type: 'issue',
  number: 0,
  identifier: 'ENG-215',
  title: 'Keyboard accessibility',
  url: 'https://linear.app/acme/issue/ENG-215/title'
} satisfies WorkspaceAttachment

const NO_LINKED_ITEMS: WorkspaceAttachment[] = []

function Hover({
  linkedItems = NO_LINKED_ITEMS
}: {
  linkedItems?: WorkspaceAttachment[]
}): React.JSX.Element {
  const hoverControl = useWorktreeCardDetailsHoverControl()
  return (
    <WorktreeCardDetailsHover
      workspace={makeWorktree({ id: WORKSPACE_ID, repoId: 'repo', hostId: 'local', linkedItems })}
      review={null}
      issue={null}
      linearIssue={null}
      comment={null}
      onManageLinks={vi.fn()}
      hoverControl={hoverControl}
    >
      <span>Workspace</span>
    </WorktreeCardDetailsHover>
  )
}

beforeEach(() => {
  fixture.setPreference.mockReset()
  fixture.setPreference.mockResolvedValue({ ok: true })
  fixture.openLocalTaskPage.mockReset()
  localTasksDomainStore.setState(localTasksDomainStore.getInitialState())
  localTasksDomainStore.getState().openEndpoint('local')
  const library = localTasksDomainStore.getState().writer('local')
  library.setConnection('live')
  library.setHostState('ready', null)
  library.applyProjects([project])
  library.applyTasks([task])
  library.applyLinks({ workspaces: [link], sessions: [] })
})

afterEach(cleanup)

describe('a task-linked workspace card', () => {
  it('hides only the chip when "Local task" is turned off, and keeps the choice in the library', () => {
    render(
      <>
        <LocalTaskWorkspaceChip worktree={{ id: WORKSPACE_ID, hostId: 'local' }} />
        <DropdownMenu open modal={false}>
          <DropdownMenuTrigger>Show properties</DropdownMenuTrigger>
          <DropdownMenuContent>
            <LocalTaskCardOptionItem />
          </DropdownMenuContent>
        </DropdownMenu>
      </>
    )
    expect(screen.getByRole('button', { name: 'Open task Export orders as CSV' })).toBeTruthy()

    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Local task' }))

    expect(screen.queryByRole('button', { name: 'Open task Export orders as CSV' })).toBeNull()
    expect(fixture.setPreference).toHaveBeenCalledWith('cardShowLocalTask', '0')
  })

  it('names the task in its own hover section when it is the only link, chip on or off', () => {
    act(() =>
      localTasksDomainStore.getState().writer('local').applyPreferences({ cardShowLocalTask: '0' })
    )
    render(<Hover />)

    expect(screen.getByText('Local task')).toBeTruthy()
    expect(screen.getByText('SHOP-12 · In Progress')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Manage links…' })).toBeTruthy()

    fireEvent.click(screen.getAllByRole('button', { name: 'Open task Export orders as CSV' })[1])
    expect(fixture.openLocalTaskPage).toHaveBeenCalledWith({ taskId: 'task-12' })
  })

  it('leads "Issues & tasks" with the task once the workspace links more than one item', () => {
    render(<Hover linkedItems={[linearIssue]} />)

    expect(screen.getByText('Issues & tasks · 2')).toBeTruthy()
    const rows = screen.getAllByRole('button', { name: /^Open/ })
    expect(rows[0].textContent).toContain('Export orders as CSV')
    expect(screen.getByText('SHOP-12 · In Progress · Local task')).toBeTruthy()
    expect(screen.queryByText('SHOP-12 · In Progress')).toBeNull()
  })

  it('does not vouch for the status while the task’s Orca is out of contact', () => {
    act(() => localTasksDomainStore.getState().setEndpointContact('local', false))
    render(<Hover />)

    expect(screen.getByText('SHOP-12 · Status can’t be confirmed')).toBeTruthy()
  })
})
