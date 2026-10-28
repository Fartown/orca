// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useAppStore } from '@/store'
import { collectRenderedSidebarRowKeys } from '@/components/sidebar/worktree-list/listing/rendered-row-keys'
import type { SidebarListModel } from '@/components/sidebar/worktree-list/listing/sidebar-list-model'
import { buildSidebarRowPlan } from '@/components/sidebar/worktree-list/grouping/build-rows.test-fixture'
import { buildRenderableRows } from '@/components/sidebar/worktree-list/listing/renderable-rows'
import { getRenderRowKey } from '@/components/sidebar/worktree-list/listing/render-row'
import { remoteRepo, repo, worktree } from '@/components/sidebar/worktree-list-groups-test-fixtures'
import { ALL_EXECUTION_HOSTS_SCOPE } from '../../../shared/execution-host'
import type { FolderWorkspace } from '../../../shared/folder-workspace-types'
import type { ProjectGroup } from '../../../shared/project-group-types'
import { addHostSectionRows } from '../../../shared/sidebar-list/host-section-rows'
import type {
  PendingCreationRef,
  PinnedWorktreeDisplayPolicy,
  Row
} from '../../../shared/sidebar-list/row-types'
import type { HostSectionRow } from '../../../shared/sidebar-list/host-section-rows'
import type { Worktree } from '../../../shared/worktree/types'
import type { WorktreeLineage } from '../../../shared/worktree/lineage-types'
import type { LocalTaskWorkspaceLink } from '../../../shared/local-tasks/local-task-link-types'
import type { LocalTask, LocalTaskProject } from '../../../shared/local-tasks/local-task-types'
import { localTasksDomainStore } from './local-tasks-domain-store'
import { SIDEBAR_GROUP_BY_TASK_PREFERENCE_KEY } from './local-task-preference-keys'
import { localTaskSidebarCollapseStore } from './local-task-sidebar-grouping'
import { useLocalTaskGroupedRowModel } from './local-task-sidebar'
import {
  findLocalTaskSidebarGroupKey,
  planLocalTaskSidebarGroups,
  renderLocalTaskSidebarGroups,
  withoutLaneCollapse,
  type LocalTaskSidebarGroupingInput
} from './local-task-sidebar-groups'

vi.mock('./local-tasks-runtime-client', () => ({
  localTasksClient: { setPreference: vi.fn(() => Promise.resolve({ ok: true })) }
}))

const GROUP: ProjectGroup = {
  id: 'group-1',
  name: 'Folder group',
  parentPath: '/tmp/parent',
  parentGroupId: null,
  createdFrom: 'folder-scan',
  tabOrder: 0,
  isCollapsed: false,
  color: null,
  createdAt: 1,
  updatedAt: 1
}
const repos = new Map([
  [repo.id, repo],
  [remoteRepo.id, remoteRepo]
])

function makeWorktree(id: string, overrides: Partial<Worktree> = {}): Worktree {
  return {
    ...worktree,
    id: `${repo.id}::/tmp/${id}`,
    displayName: id,
    path: `/tmp/${id}`,
    ...overrides
  }
}

function makeTask(id: string, ref: string, parentId: string | null = null): LocalTask {
  return {
    id,
    projectId: 'project-1',
    number: Number(ref.split('-')[1]),
    ref,
    title: `${ref} title`,
    description: '',
    criteria: [],
    statusId: 'status-1',
    priority: 0,
    labels: [],
    parentId,
    createdAt: 1,
    updatedAt: 1,
    revision: 1
  }
}

function makeLink(
  taskId: string,
  place: Partial<LocalTaskWorkspaceLink> & Pick<LocalTaskWorkspaceLink, 'hostId'>
): LocalTaskWorkspaceLink {
  return {
    taskId,
    kind: 'git-worktree',
    instanceId: null,
    worktreeId: null,
    folderWorkspaceId: null,
    repoId: null,
    branchSnapshot: null,
    nameSnapshot: null,
    hostLabelSnapshot: null,
    linkedVia: 'manual',
    linkedAt: 1,
    ...place
  }
}

type FlatOptions = {
  worktrees: Worktree[]
  policy?: PinnedWorktreeDisplayPolicy
  lineageById?: Record<string, WorktreeLineage>
  folderWorkspaces?: FolderWorkspace[]
  pendingCreations?: PendingCreationRef[]
}

/** Upstream's own flat-mode ("none") rows, as the list model hands them over. */
function flatPlan(options: FlatOptions): ReturnType<typeof buildSidebarRowPlan> {
  return buildSidebarRowPlan(
    'none',
    options.worktrees,
    repos,
    null,
    new Set(),
    undefined,
    undefined,
    'manual',
    options.lineageById ?? {},
    new Map(options.worktrees.map((entry) => [entry.id, entry])),
    true,
    undefined,
    [GROUP],
    new Set(),
    new Map(),
    new Map(),
    options.pendingCreations ?? [],
    undefined,
    options.folderWorkspaces ?? [],
    undefined,
    'local',
    options.policy ?? 'single-location'
  )
}

function flatRows(options: FlatOptions): Row[] {
  return flatPlan(options).render(new Set())
}

function input(
  tasks: LocalTask[],
  workspaces: LocalTaskWorkspaceLink[],
  taskIdForCreation: (creationId: string) => string | null = () => null
): LocalTaskSidebarGroupingInput {
  return { tasks, links: { workspaces, sessions: [] }, defaultHostId: 'local', taskIdForCreation }
}

/** `header:<key>` for task headers, the workspace name for cards, the row type otherwise. */
function outline(rows: readonly HostSectionRow[]): string[] {
  return rows.map((row) => {
    if (row.type === 'header' || row.type === 'host-header') {
      return `${row.type}:${row.key}`
    }
    if (row.type === 'item') {
      return `${'  '.repeat(row.depth)}${row.worktree.displayName}`
    }
    return row.type === 'folder-workspace' ? row.folderWorkspace.name : row.type
  })
}

const shop12 = makeTask('task-12', 'SHOP-12')
const shop13 = makeTask('task-13', 'SHOP-13')

describe('planLocalTaskSidebarGroups', () => {
  it('puts each workspace under its task and the unlinked ones in a last No task group', () => {
    const refund = makeWorktree('refund-webhook')
    const orderExport = makeWorktree('shop-12-order-export')
    const plan = planLocalTaskSidebarGroups(
      flatRows({ worktrees: [refund, orderExport] }),
      input([shop12], [makeLink(shop12.id, { hostId: 'local', worktreeId: orderExport.id })])
    )
    const rows = renderLocalTaskSidebarGroups(plan, new Set())

    expect(outline(rows)).toEqual([
      'header:local-task:task:task-12',
      'shop-12-order-export',
      'header:local-task:none',
      'refund-webhook'
    ])
    expect(rows[0]).toMatchObject({ localTaskId: shop12.id, count: 1 })
    // Drag groups and selection read the item's section as its group.
    expect(rows[1]).toMatchObject({ sectionKey: 'local-task:task:task-12' })
  })

  it('shows a pinned workspace once, inside its task group, under either pinned policy', () => {
    const pinned = makeWorktree('pinned-task-ws', { isPinned: true })
    const other = makeWorktree('other')
    const links = [makeLink(shop13.id, { hostId: 'local', worktreeId: pinned.id })]
    for (const policy of ['single-location', 'duplicate-in-groups'] as const) {
      const plan = planLocalTaskSidebarGroups(
        flatRows({ worktrees: [pinned, other], policy }),
        input([shop13], links)
      )
      expect(outline(renderLocalTaskSidebarGroups(plan, new Set()))).toEqual([
        'header:local-task:task:task-13',
        'pinned-task-ws',
        'header:local-task:none',
        'other'
      ])
    }
  })

  it('keeps lineage children with their root, grouping an unlinked root by its linked child', () => {
    const parent = makeWorktree('parent', { instanceId: 'parent-instance' })
    const child = makeWorktree('child', { instanceId: 'child-instance' })
    const lineageById: Record<string, WorktreeLineage> = {
      [child.id]: {
        worktreeId: child.id,
        worktreeInstanceId: 'child-instance',
        parentWorktreeId: parent.id,
        parentWorktreeInstanceId: 'parent-instance',
        origin: 'cli',
        capture: { source: 'terminal-context', confidence: 'inferred' },
        createdAt: 1
      }
    }
    const plan = planLocalTaskSidebarGroups(
      flatRows({ worktrees: [parent, child], lineageById }),
      input([shop12], [makeLink(shop12.id, { hostId: 'local', worktreeId: child.id })])
    )
    expect(outline(renderLocalTaskSidebarGroups(plan, new Set()))).toEqual([
      'header:local-task:task:task-12',
      'parent',
      '  child'
    ])
  })

  it('matches by instance first, then by host and id, and groups folder workspaces by folder', () => {
    const renamed = makeWorktree('renamed', { instanceId: 'stable-instance' })
    const localTwin = makeWorktree('shared')
    const remote: Worktree = { ...makeWorktree('remote'), repoId: remoteRepo.id }
    const folder: FolderWorkspace = {
      id: 'fw-1',
      projectGroupId: GROUP.id,
      name: 'folder-ws',
      folderPath: '/tmp/parent',
      linkedTask: null,
      comment: '',
      isArchived: false,
      isUnread: false,
      isPinned: false,
      sortOrder: 1,
      lastActivityAt: 1,
      createdAt: 1,
      updatedAt: 1
    }
    const subtask = makeTask('task-12-1', 'SHOP-14', shop12.id)
    const plan = planLocalTaskSidebarGroups(
      flatRows({ worktrees: [renamed, localTwin, remote], folderWorkspaces: [folder] }),
      input(
        [shop12, shop13, subtask],
        [
          makeLink(shop12.id, {
            hostId: 'local',
            instanceId: 'stable-instance',
            worktreeId: `${repo.id}::/tmp/old-name`
          }),
          // Same id on the SSH host only: the local twin must not borrow it.
          makeLink(shop13.id, { hostId: 'ssh:gpu-vm', worktreeId: localTwin.id }),
          makeLink(shop13.id, { hostId: 'ssh:gpu-vm', worktreeId: remote.id }),
          makeLink(subtask.id, { hostId: 'local', kind: 'folder', folderWorkspaceId: folder.id })
        ]
      )
    )
    expect(outline(renderLocalTaskSidebarGroups(plan, new Set()))).toEqual([
      'header:local-task:task:task-12',
      'renamed',
      'folder-ws',
      'header:local-task:task:task-13',
      'remote',
      'header:local-task:none',
      'shared'
    ])
  })

  it('groups inside each host section, keeping every render key unique', () => {
    const local = makeWorktree('local-ws')
    const remote: Worktree = { ...makeWorktree('remote-ws'), repoId: remoteRepo.id }
    const loose: Worktree = { ...makeWorktree('remote-loose'), repoId: remoteRepo.id }
    const sectioned = addHostSectionRows({
      rows: flatRows({ worktrees: [local, remote, loose] }),
      hostOptions: [
        { id: 'local', kind: 'local', label: 'This Mac', detail: '', health: 'local' },
        { id: 'ssh:gpu-vm', kind: 'ssh', label: 'gpu-vm', detail: '', health: 'available' }
      ],
      workspaceHostScope: ALL_EXECUTION_HOSTS_SCOPE,
      visibleWorkspaceHostIds: ['local', 'ssh:gpu-vm'],
      defaultHostId: 'local',
      localHostLabel: 'This Mac',
      preferProjectGrouping: true
    })
    const plan = planLocalTaskSidebarGroups(
      sectioned,
      input(
        [shop12],
        [
          makeLink(shop12.id, { hostId: 'ssh:gpu-vm', worktreeId: remote.id }),
          makeLink(shop12.id, { hostId: 'local', worktreeId: local.id })
        ]
      )
    )
    const rows = renderLocalTaskSidebarGroups(plan, new Set())

    expect(outline(rows)).toEqual([
      'host-header:host:local',
      'header:local-task:local/task:task-12',
      'local-ws',
      'host-header:host:ssh:gpu-vm',
      'header:local-task:ssh:gpu-vm/task:task-12',
      'remote-ws',
      'header:local-task:ssh:gpu-vm/none',
      'remote-loose'
    ])
    const keys = buildRenderableRows(rows).map(getRenderRowKey)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('folds a group to its header but still knows where its workspaces and creations live', () => {
    const orderExport = makeWorktree('shop-12-order-export')
    const plan = planLocalTaskSidebarGroups(
      flatRows({
        worktrees: [orderExport],
        pendingCreations: [{ creationId: 'creating', repoId: repo.id }]
      }),
      input(
        [shop12],
        [makeLink(shop12.id, { hostId: 'local', worktreeId: orderExport.id })],
        (creationId) => (creationId === 'creating' ? shop12.id : null)
      )
    )
    const groupKey = 'local-task:task:task-12'
    const folded = renderLocalTaskSidebarGroups(plan, new Set([groupKey]))

    expect(outline(folded)).toEqual([`header:${groupKey}`])
    expect(folded[0]).toMatchObject({ count: 1 })
    expect(findLocalTaskSidebarGroupKey(plan, orderExport.id, 'local')).toBe(groupKey)
    expect(findLocalTaskSidebarGroupKey(plan, orderExport.id, 'ssh:gpu-vm')).toBeNull()
    expect(plan.groupKeyByRowKey.get('pending:creating')).toBe(groupKey)
  })
})

describe('withoutLaneCollapse', () => {
  it("drops flat mode's All and Pinned folds, host-scoped too, and keeps the rest", () => {
    const kept = new Set(['lineage:x', 'host:ssh:gpu-vm'])
    expect(withoutLaneCollapse(kept)).toBe(kept)
    expect([
      ...withoutLaneCollapse(new Set(['all', 'pinned:host:ssh:gpu-vm', 'lineage:x', 'host:local']))
    ]).toEqual(['lineage:x', 'host:local'])
  })
})

describe('useLocalTaskGroupedRowModel', () => {
  const orderExport = makeWorktree('shop-12-order-export')
  const refund = makeWorktree('refund-webhook')
  const groupKey = 'local-task:task:task-12'
  const project: LocalTaskProject = {
    id: 'project-1',
    name: 'Shop',
    prefix: 'SHOP',
    aliases: [],
    repos: ['orca-project'],
    defaultRepoId: 'orca-project',
    lastExecutionHostId: null,
    rules: { startMovesToInProgress: true, prMergedCompletes: true },
    statuses: [],
    createdAt: 1,
    updatedAt: 1,
    revision: 1
  }

  function rowModel(): SidebarListModel['rowModel'] {
    const plan = flatPlan({ worktrees: [refund, orderExport] })
    const rows = plan.render(new Set())
    return {
      occurrencePlan: plan.occurrencePlan,
      hostOptions: [],
      effectiveCollapsedGroups: new Set(),
      rows,
      sectionRows: rows,
      renderedSidebarRowKeys: collectRenderedSidebarRowKeys(rows),
      allRepoIds: [repo.id],
      placeholderRepoIds: new Set(),
      handleReorderHostSections: () => {},
      setHostDragActive: () => {}
    }
  }

  function render(enabled: boolean, model = rowModel()) {
    return renderHook(() =>
      useLocalTaskGroupedRowModel(model, {
        enabled,
        defaultHostId: 'local',
        agentSendTargetWorktreeId: null
      })
    )
  }

  beforeEach(() => {
    localTasksDomainStore.setState(localTasksDomainStore.getInitialState())
    localTasksDomainStore.getState().openEndpoint('local')
    const library = localTasksDomainStore.getState().writer('local')
    library.applyProjects([project])
    library.applyTasks([shop12])
    library.applyLinks({
      workspaces: [makeLink(shop12.id, { hostId: 'local', worktreeId: orderExport.id })],
      sessions: []
    })
    library.applyPreferences({ [SIDEBAR_GROUP_BY_TASK_PREFERENCE_KEY]: '1' })
  })

  afterEach(() => {
    cleanup()
    localTasksDomainStore.setState(localTasksDomainStore.getInitialState())
    localTaskSidebarCollapseStore.setState({ collapsed: new Set() })
    useAppStore.setState({ pendingRevealWorktree: null, pendingRevealSidebarRow: null })
  })

  it('hands back the very same row model while task grouping is off', () => {
    const model = rowModel()
    expect(render(false, model).result.current).toBe(model)
  })

  it('opens a folded task group when its workspace is revealed', () => {
    localTaskSidebarCollapseStore.setState({ collapsed: new Set([groupKey]) })
    const { result } = render(true)
    expect(outline(result.current.sectionRows)).toEqual([
      `header:${groupKey}`,
      'header:local-task:none',
      'refund-webhook'
    ])
    expect(result.current.renderedSidebarRowKeys.has(groupKey)).toBe(true)

    act(() => {
      useAppStore.setState({
        pendingRevealWorktree: { worktreeId: orderExport.id, behavior: 'auto' }
      })
    })

    expect(outline(result.current.sectionRows).slice(0, 2)).toEqual([
      `header:${groupKey}`,
      'shop-12-order-export'
    ])
  })

  it('turns task grouping off when a project header is revealed, as upstream needs Project', () => {
    render(true)
    act(() => {
      useAppStore.setState({ pendingRevealSidebarRow: { rowKey: 'repo:repo-1', behavior: 'auto' } })
    })
    expect(
      localTasksDomainStore.getState().preferences[SIDEBAR_GROUP_BY_TASK_PREFERENCE_KEY]
    ).toBeNull()
  })
})
