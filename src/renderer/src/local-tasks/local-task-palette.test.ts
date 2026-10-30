// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalTask, LocalTaskProject } from '../../../shared/local-tasks/local-task-types'
import type { LocalTaskWorkspaceLink } from '../../../shared/local-tasks/local-task-link-types'

type PaletteFixture = {
  located: unknown
  startState: { mode: string; reason: string | null }
  runLocalTaskStart: ReturnType<typeof vi.fn>
  openLocalTaskPage: ReturnType<typeof vi.fn>
  toastError: ReturnType<typeof vi.fn>
}

const fixture: PaletteFixture = vi.hoisted(() => ({
  located: null,
  startState: { mode: 'create', reason: null },
  runLocalTaskStart: vi.fn(),
  openLocalTaskPage: vi.fn(),
  toastError: vi.fn()
}))

vi.mock('@/store', async () => {
  const { createTestStore } = await import('@/store/slices/store-test-helpers')
  return { useAppStore: createTestStore() }
})
vi.mock('sonner', () => ({ toast: { error: fixture.toastError } }))
vi.mock('./local-task-navigation', () => ({ openLocalTaskPage: fixture.openLocalTaskPage }))
vi.mock('./local-task-work-actions', () => ({
  runLocalTaskStart: fixture.runLocalTaskStart,
  selectLocalTaskStartState: () => fixture.startState
}))
vi.mock('./local-task-workspace-resolution', () => ({
  localTaskWorktreeHostId: (_state: unknown, worktree: { hostId?: string }) =>
    worktree.hostId ?? 'local',
  selectLocalTaskWorkspace: () => fixture.located
}))

import { searchWorktrees } from '@/lib/worktree-palette-search'
import {
  getNextWorktreePaletteSelection,
  getWorktreePaletteSelectionItemIds
} from '@/lib/worktree-palette-create-action'
import { makeWorktree } from '@/store/slices/worktrees-slice-test-fixtures'
import { buildLocalTaskWorkspaceEvidence } from './local-task-palette-evidence'
import { buildLocalTaskPaletteItems } from './local-task-palette-items'
import { useLocalTaskPaletteSelection } from './local-task-palette-selection'
import { localTasksDomainStore } from './local-tasks-domain-store'

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

const task: LocalTask = {
  id: 'task-12',
  projectId: 'shop',
  number: 12,
  ref: 'SHOP-12',
  title: 'Export orders',
  description: '',
  criteria: [],
  statusId: 'todo',
  priority: 0,
  labels: [],
  parentId: null,
  createdAt: 0,
  updatedAt: 0,
  revision: 0
}

const workspace = makeWorktree({
  id: 'repo::/repo/feature',
  repoId: 'repo',
  hostId: 'local',
  displayName: 'checkout-fix'
})

const link: LocalTaskWorkspaceLink = {
  taskId: 'task-12',
  hostId: 'local',
  kind: 'git-worktree',
  instanceId: null,
  worktreeId: workspace.id,
  folderWorkspaceId: null,
  repoId: 'repo',
  branchSnapshot: null,
  nameSnapshot: null,
  hostLabelSnapshot: null,
  linkedVia: 'manual',
  linkedAt: 0
}

const [item] = buildLocalTaskPaletteItems([project], [task], 'SHOP-12')

function select() {
  const handlers = {
    handleSelectWorktree: vi.fn(),
    closeModal: vi.fn(),
    recordFeatureInteraction: vi.fn(),
    setSelectedItemId: vi.fn()
  }
  const { result } = renderHook(() =>
    useLocalTaskPaletteSelection({
      visible: true,
      taskItems: [item],
      skipRestoreFocusRef: { current: false },
      ...handlers
    })
  )
  return { run: result.current, ...handlers }
}

beforeEach(() => {
  vi.clearAllMocks()
  fixture.located = null
  fixture.startState = { mode: 'create', reason: null }
  localTasksDomainStore.setState(localTasksDomainStore.getInitialState())
  localTasksDomainStore.getState().openEndpoint('local')
  const library = localTasksDomainStore.getState().writer('local')
  library.applyProjects([project])
  library.applyTasks([task])
  library.applyLinks({ workspaces: [], sessions: [] })
})

describe('a local task in Cmd+J', () => {
  it('finds its workspace by the task ref, as upstream finds one by its issue', () => {
    const evidence = buildLocalTaskWorkspaceEvidence(
      { workspaces: [link], sessions: [] },
      [task],
      () => 'local'
    )
    const other = makeWorktree({ id: 'repo::/repo/other', repoId: 'repo', hostId: 'local' })
    const matches = searchWorktrees([workspace, other], 'SHOP-12', new Map(), {
      localTaskEvidence: evidence
    })
    expect(matches.map((match) => match.worktreeId)).toEqual([workspace.id])
  })

  it('goes to the workspace the task works in on Enter', () => {
    localTasksDomainStore
      .getState()
      .writer('local')
      .applyLinks({ workspaces: [link], sessions: [] })
    fixture.located = workspace
    const palette = select()
    palette.run(item)
    expect(palette.handleSelectWorktree).toHaveBeenCalledWith(workspace)
    expect(fixture.openLocalTaskPage).not.toHaveBeenCalled()
  })

  it('opens the task on Enter while it has no workspace in this window', () => {
    const palette = select()
    palette.run(item)
    expect(palette.closeModal).toHaveBeenCalled()
    expect(fixture.openLocalTaskPage).toHaveBeenCalledWith({ taskId: 'task-12' })
  })

  // Why: a row the palette cannot select drops back to no selection, so Cmd+Enter fell to Enter.
  it('stays the palette selection when highlighted, which Cmd+Enter reads', () => {
    const entries = [{ id: '__header_tasks__', type: 'section-header' }, item]
    const selectable = getWorktreePaletteSelectionItemIds(entries)
    expect(selectable).toEqual([item.id])
    expect(
      getNextWorktreePaletteSelection({
        currentSelectedItemId: item.id,
        queryChanged: false,
        selectableItemIds: selectable,
        showCreateAction: true
      })
    ).toBe(item.id)
  })

  it('starts work on Cmd+Enter once the palette has closed', async () => {
    const palette = select()
    palette.run(item, true)
    expect(palette.closeModal).toHaveBeenCalled()
    expect(fixture.runLocalTaskStart).not.toHaveBeenCalled()
    await Promise.resolve()
    expect(fixture.runLocalTaskStart).toHaveBeenCalledWith(task, project, null)
    expect(fixture.openLocalTaskPage).not.toHaveBeenCalled()
  })

  it('opens the task page for a folder project on Cmd+Enter, where the workspace picker lives', async () => {
    fixture.startState = { mode: 'existing', reason: null }
    const palette = select()
    palette.run(item, true)
    expect(fixture.openLocalTaskPage).toHaveBeenCalledWith({ taskId: 'task-12' })
    await Promise.resolve()
    expect(fixture.runLocalTaskStart).toHaveBeenCalledWith(task, project, null)
  })

  it('goes to the live workspace on Cmd+Enter, since there is nothing left to start', () => {
    localTasksDomainStore
      .getState()
      .writer('local')
      .applyLinks({ workspaces: [link], sessions: [] })
    fixture.located = workspace
    fixture.startState = { mode: 'hidden', reason: null }
    const palette = select()
    palette.run(item, true)
    expect(palette.handleSelectWorktree).toHaveBeenCalledWith(workspace)
    expect(fixture.runLocalTaskStart).not.toHaveBeenCalled()
  })

  it('keeps the palette open and says why when the host cannot start it', () => {
    fixture.startState = { mode: 'create', reason: 'build-box is not connected' }
    const palette = select()
    palette.run(item, true)
    expect(fixture.toastError).toHaveBeenCalledWith('build-box is not connected')
    expect(palette.closeModal).not.toHaveBeenCalled()
  })
})
