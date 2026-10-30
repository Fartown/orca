// @vitest-environment happy-dom
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FolderWorkspace } from '../../../shared/folder-workspace-types'
import type { LocalTaskWorkspaceLink } from '../../../shared/local-tasks/local-task-link-types'
import { LOCAL_TASK_SOURCE_HIDDEN_PREFERENCE_KEY } from '../../../shared/local-tasks/local-task-source-visibility'
import type { LocalTask, LocalTaskProject } from '../../../shared/local-tasks/local-task-types'
import { folderWorkspaceKey } from '../../../shared/workspace-scope'
import type { Worktree } from '../../../shared/worktree/types'
import type { ExecutionHostId } from '../../../shared/execution-host'

const client = vi.hoisted(() => ({ linkWorkspace: vi.fn(), unlinkWorkspace: vi.fn() }))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children?: ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
  TooltipTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>
}))
vi.mock('@/runtime/runtime-linear-client', () => ({
  linearStatus: vi.fn(async () => ({ connected: false, viewer: null }))
}))
vi.mock('./local-tasks-runtime-client', () => ({ localTasksClient: client }))

import { useAppStore } from '@/store'
import WorktreeMetaDialog from '@/components/sidebar/WorktreeMetaDialog'
import { localTasksDomainStore } from './local-tasks-domain-store'
import type { LocalTaskEndpointKey } from './local-task-endpoints'
import { openLocalTaskWorkspaceDetails } from './local-task-workspace-details'

const initialState = useAppStore.getInitialState()
const updateWorktreeMeta = vi.fn(async () => ({ ok: true as const }))
const WORKTREE: Worktree = {
  id: 'repo1::/repo1/feature',
  repoId: 'repo1',
  path: '/repo1/feature',
  displayName: 'feature',
  branch: 'feature',
  head: 'abc',
  isBare: false,
  isMainWorktree: false,
  comment: '',
  linkedIssue: null,
  linkedPR: null,
  linkedLinearIssue: null,
  isArchived: false,
  isUnread: false,
  isPinned: false,
  sortOrder: 0,
  lastActivityAt: 1
}

function project(endpointPrefix: string): LocalTaskProject {
  return {
    id: `${endpointPrefix}shop`,
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
    revision: 1
  }
}

function task(endpointPrefix: string, number: number, title: string): LocalTask {
  return {
    id: `${endpointPrefix}t${number}`,
    projectId: `${endpointPrefix}shop`,
    number,
    ref: `SHOP-${number}`,
    title,
    description: '',
    criteria: [],
    statusId: 'todo',
    priority: 0,
    labels: [],
    parentId: null,
    createdAt: 0,
    updatedAt: 0,
    revision: 1
  }
}

function link(
  taskId: string,
  overrides: Partial<LocalTaskWorkspaceLink> = {}
): LocalTaskWorkspaceLink {
  return {
    taskId,
    hostId: 'local',
    kind: 'git-worktree',
    instanceId: null,
    worktreeId: WORKTREE.id,
    folderWorkspaceId: null,
    repoId: 'repo1',
    branchSnapshot: null,
    nameSnapshot: 'feature',
    hostLabelSnapshot: null,
    linkedVia: 'manual',
    linkedAt: 1,
    ...overrides
  }
}

function library(
  endpoint: LocalTaskEndpointKey,
  links: LocalTaskWorkspaceLink[] = [],
  inContact = true
): void {
  const prefix = endpoint === 'local' ? '' : `${endpoint}/`
  const domain = localTasksDomainStore.getState()
  domain.openEndpoint(endpoint)
  domain.setEndpointContact(endpoint, inContact)
  const writer = domain.writer(endpoint)
  writer.setConnection('live')
  writer.setHostState('ready', null)
  writer.applyProjects([project(prefix)])
  writer.applyTasks([task(prefix, 12, 'Order export'), task(prefix, 13, 'Refund flow')])
  writer.applyLinks({ workspaces: links, sessions: [] })
}

function openDetails(worktree: Worktree = WORKTREE, hostId: ExecutionHostId = 'local'): void {
  useAppStore.setState({
    repos: [
      {
        id: 'repo1',
        path: '/repo1',
        displayName: 'Shop',
        badgeColor: '',
        addedAt: 1,
        ...(hostId === 'local' ? {} : { executionHostId: hostId })
      }
    ],
    worktreesByRepo: { repo1: [worktree] }
  })
  openLocalTaskWorkspaceDetails({ worktreeId: worktree.id, hostId })
  render(<WorktreeMetaDialog />)
}

function linkedRows(): string[] {
  return [...document.querySelectorAll('[data-workspace-linked-item]')].map(
    (row) => row.textContent ?? ''
  )
}

async function pick(title: string): Promise<void> {
  const option = await screen.findByRole('option', { name: new RegExp(title) })
  await waitFor(() => expect(option.getAttribute('data-disabled')).not.toBe('true'))
  fireEvent.click(option)
}

async function save(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(useAppStore.getState().activeModal).not.toBe('edit-meta'))
}

describe('workspace details → linked work → Local tasks (REQ-011)', () => {
  beforeEach(() => {
    useAppStore.setState(initialState, true)
    useAppStore.setState({
      fetchWorkItems: vi.fn(async () => []),
      getCachedWorkItems: vi.fn(() => []),
      refreshPreflightStatus: vi.fn(async () => {}),
      checkLinearConnection: vi.fn(async () => {}),
      readJiraStatus: vi.fn(async () => ({ connected: false, viewer: null, sites: [] })),
      linearStatusChecked: true,
      updateWorktreeMeta
    })
    localTasksDomainStore.setState(localTasksDomainStore.getInitialState())
    Element.prototype.scrollIntoView = vi.fn()
    updateWorktreeMeta.mockClear()
    client.linkWorkspace.mockReset().mockResolvedValue({ ok: true, workspace: {} })
    client.unlinkWorkspace.mockReset().mockResolvedValue({ ok: true })
  })
  afterEach(cleanup)

  it('opens on the tab after Smart and links the picked task only when Save is pressed', async () => {
    library('local')
    openDetails()
    const tab = screen.getByRole('tab', { name: 'Local' })
    const tabs = screen.getAllByRole('tab').map((candidate) => candidate.textContent)
    expect(tabs.indexOf('Local')).toBe(tabs.indexOf('Smart') + 1)
    await waitFor(() => expect(tab.getAttribute('aria-selected')).toBe('true'))
    await pick('Order export')
    await pick('Refund flow')
    expect(linkedRows()).toEqual([expect.stringContaining('Refund flow')])
    expect(screen.getByText('1 linked')).toBeTruthy()
    expect(client.linkWorkspace).not.toHaveBeenCalled()
    await save()
    expect(client.unlinkWorkspace).not.toHaveBeenCalled()
    expect(client.linkWorkspace).toHaveBeenCalledOnce()
    expect(client.linkWorkspace.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        taskId: 't13',
        hostId: 'local',
        kind: 'git-worktree',
        worktreeId: WORKTREE.id,
        linkedVia: 'manual'
      })
    )
  })

  it('searches by ref and writes nothing on Cancel', async () => {
    library('local')
    openDetails()
    const field = screen.getByRole('combobox', { name: 'Search references' })
    fireEvent.change(field, { target: { value: 'shop-13' } })
    await waitFor(() =>
      expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
        expect.stringContaining('Refund flow')
      ])
    )
    await pick('Refund flow')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(useAppStore.getState().activeModal).not.toBe('edit-meta')
    expect(client.linkWorkspace).not.toHaveBeenCalled()
  })

  it('shows the saved task, replaces it with another, and unlinks the old one first on Save', async () => {
    library('local', [link('t12')])
    openDetails()
    expect(linkedRows()).toEqual([expect.stringContaining('Order export')])
    expect(screen.getByText('1 linked')).toBeTruthy()
    await pick('Refund flow')
    expect(linkedRows()).toEqual([expect.stringContaining('Replaces “Order export”')])
    await save()
    expect(client.unlinkWorkspace).toHaveBeenCalledWith('t12')
    expect(client.linkWorkspace.mock.calls[0][0]).toEqual(
      expect.objectContaining({ taskId: 't13' })
    )
    expect(client.unlinkWorkspace.mock.invocationCallOrder[0]).toBeLessThan(
      client.linkWorkspace.mock.invocationCallOrder[0]
    )
  })

  it('unlinks the saved task with the row’s remove button and keeps the dialog open when that fails', async () => {
    library('local', [link('t12')])
    client.unlinkWorkspace.mockResolvedValue({ ok: false, code: 'read_only' })
    openDetails()
    fireEvent.click(screen.getByRole('button', { name: 'Unlink Order export' }))
    expect(linkedRows()).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(
      await screen.findByText('The task link was not saved. Save again to retry.')
    ).toBeTruthy()
    expect(updateWorktreeMeta).toHaveBeenCalled()
    expect(useAppStore.getState().activeModal).toBe('edit-meta')
  })

  it('links a folder workspace as a folder', async () => {
    const folder: FolderWorkspace = {
      id: 'folder-1',
      projectGroupId: 'group',
      name: 'Docs',
      folderPath: '/docs',
      linkedTask: null,
      comment: '',
      isArchived: false,
      isUnread: false,
      isPinned: false,
      sortOrder: 0,
      lastActivityAt: 1,
      createdAt: 1,
      updatedAt: 1
    }
    library('local')
    useAppStore.setState({ folderWorkspaces: [folder] })
    openLocalTaskWorkspaceDetails({ worktreeId: folderWorkspaceKey(folder.id), hostId: 'local' })
    render(<WorktreeMetaDialog />)
    await pick('Order export')
    await save()
    expect(client.linkWorkspace.mock.calls[0][0]).toEqual(
      expect.objectContaining({ taskId: 't12', kind: 'folder', folderWorkspaceId: 'folder-1' })
    )
  })

  it('greys the tab’s tasks while a paired server is out of contact, and reads nothing new', async () => {
    library('runtime:env-1', [], false)
    openDetails({ ...WORKTREE, hostId: 'runtime:env-1' }, 'runtime:env-1')
    expect(
      await screen.findByRole('option', {
        name: /is not connected, so tasks can’t be linked now\. The tasks below are as last read/
      })
    ).toBeTruthy()
    const row = screen.getByRole('option', { name: /Order export/ })
    expect(row.getAttribute('data-disabled')).toBe('true')
  })

  it('leaves the tab out while Local is hidden in Settings, but still shows the saved task', () => {
    library('local', [link('t12')])
    localTasksDomainStore
      .getState()
      .writer('local')
      .applyPreferences({ [LOCAL_TASK_SOURCE_HIDDEN_PREFERENCE_KEY]: '1' })
    openDetails()
    expect(screen.queryByRole('tab', { name: 'Local' })).toBeNull()
    expect(linkedRows()).toEqual([expect.stringContaining('Order export')])
  })
})
