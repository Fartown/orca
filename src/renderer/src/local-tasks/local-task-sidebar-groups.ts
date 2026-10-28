import { collectRenderedSidebarRowKeys } from '@/components/sidebar/worktree-list/listing/rendered-row-keys'
import { getWorktreeExecutionHostId, type ExecutionHostId } from '../../../shared/execution-host'
import { getFolderWorkspaceHostId } from '../../../shared/sidebar-list/folder-workspace-host-id'
import { ALL_GROUP_KEY, PINNED_GROUP_KEY } from '../../../shared/sidebar-list/group-keys'
import type { HostHeaderRow, HostSectionRow } from '../../../shared/sidebar-list/host-section-rows'
import type { GroupHeaderRow, Row, WorktreeRow } from '../../../shared/sidebar-list/row-types'
import { folderWorkspaceKey } from '../../../shared/workspace-scope'
import { getWorktreeHostIdentity } from '../../../shared/worktree/host-qualified-identity'
import type { LocalTaskLinks } from '../../../shared/local-tasks/local-task-link-types'
import type { LocalTask } from '../../../shared/local-tasks/local-task-types'
import { findLocalTaskLinkForWorkspace } from './local-task-link-selectors'

export const LOCAL_TASK_SIDEBAR_GROUP_PREFIX = 'local-task:'

/** A task's group header in the sidebar; `localTaskId` is null for the "no task" group. */
export type LocalTaskSidebarHeaderRow = GroupHeaderRow & { localTaskId: string | null }

export function isLocalTaskSidebarHeader(row: GroupHeaderRow): row is LocalTaskSidebarHeaderRow {
  return row.key.startsWith(LOCAL_TASK_SIDEBAR_GROUP_PREFIX) && 'localTaskId' in row
}

export type LocalTaskSidebarGroupingInput = {
  tasks: readonly LocalTask[]
  links: LocalTaskLinks
  defaultHostId: ExecutionHostId
  /** The task a workspace creation still in flight was started for. */
  taskIdForCreation: (creationId: string) => string | null
}

type Unit = { rows: Row[]; taskId: string | null; dropped: boolean }
type Group = { header: LocalTaskSidebarHeaderRow; rows: Row[] }
type Segment = { hostHeader: HostHeaderRow | null; groups: Group[] }
type WorkspacePlace = { hostId: ExecutionHostId; key: string }

export type LocalTaskSidebarPlan = {
  segments: Segment[]
  groupKeyByRowKey: ReadonlyMap<string, string>
  groupsByWorkspaceId: ReadonlyMap<string, readonly WorkspacePlace[]>
}

function isLaneCollapseKey(key: string): boolean {
  return [ALL_GROUP_KEY, PINNED_GROUP_KEY].some(
    (lane) => key === lane || key.startsWith(`${lane}:host:`)
  )
}

/** Flat mode's own All/Pinned collapse would hide rows that now belong to task groups. */
export function withoutLaneCollapse(collapsedGroups: Set<string>): Set<string> {
  if (![...collapsedGroups].some(isLaneCollapseKey)) {
    return collapsedGroups
  }
  return new Set([...collapsedGroups].filter((key) => !isLaneCollapseKey(key)))
}

function isWorktreeRow(row: Row): row is WorktreeRow {
  return row.type === 'item'
}

function rowWorkspace(
  row: Row,
  defaultHostId: ExecutionHostId
): { id: string; hostId: ExecutionHostId; instanceId?: string } | null {
  if (row.type === 'item') {
    return {
      id: row.worktree.id,
      hostId: getWorktreeExecutionHostId(row.worktree, row.repo, defaultHostId),
      instanceId: row.worktree.instanceId
    }
  }
  if (row.type === 'folder-workspace') {
    return {
      id: folderWorkspaceKey(row.folderWorkspace.id),
      hostId: getFolderWorkspaceHostId(row.folderWorkspace, row.projectGroup, defaultHostId)
    }
  }
  return null
}

/**
 * Lineage descendants travel with their root, as in every upstream grouping; a pinned copy of a
 * workspace that also shows in its natural place is dropped, so each workspace appears once.
 */
function collectUnits(rows: readonly Row[]): Unit[] {
  const natural = new Set(
    rows
      .filter(isWorktreeRow)
      .filter((row) => row.sectionKey !== PINNED_GROUP_KEY)
      .map((row) => getWorktreeHostIdentity(row.worktree))
  )
  const emitted = new Set<string>()
  const units: Unit[] = []
  let lineage: Unit | null = null
  for (const row of rows) {
    if (row.type === 'header') {
      lineage = null
      continue
    }
    if (row.type === 'item' && row.depth > 0 && lineage) {
      lineage.rows.push(row)
      continue
    }
    const unit: Unit = { rows: [row], taskId: null, dropped: false }
    if (row.type === 'item') {
      const identity = getWorktreeHostIdentity(row.worktree)
      unit.dropped =
        emitted.has(identity) || (row.sectionKey === PINNED_GROUP_KEY && natural.has(identity))
      if (!unit.dropped) {
        emitted.add(identity)
      }
      lineage = unit
    } else {
      lineage = null
    }
    units.push(unit)
  }
  return units
}

function resolveUnitTasks(units: Unit[], input: LocalTaskSidebarGroupingInput): void {
  const tasksById = new Map(input.tasks.map((task) => [task.id, task]))
  // Why the root: a cross-repo task keeps each repo's workspace on a subtask, and they belong together.
  const topLevel = (taskId: string | null | undefined): string | null => {
    let task = taskId ? tasksById.get(taskId) : undefined
    if (!task) {
      return null
    }
    const seen = new Set<string>([task.id])
    while (task.parentId) {
      const parent = tasksById.get(task.parentId)
      if (!parent || seen.has(parent.id)) {
        break
      }
      seen.add(parent.id)
      task = parent
    }
    return task.id
  }
  let anchorTaskId: string | null = null
  for (const unit of units) {
    const [first] = unit.rows
    if (
      first?.type === 'imported-worktrees-card' ||
      first?.type === 'new-external-worktrees-inbox'
    ) {
      // Why: upstream places a project's notice right after that project's last card.
      unit.taskId = anchorTaskId
      continue
    }
    if (first?.type === 'pending-creation') {
      unit.taskId = topLevel(input.taskIdForCreation(first.creationId))
      continue
    }
    for (const row of unit.rows) {
      const workspace = rowWorkspace(row, input.defaultHostId)
      const taskId = workspace
        ? topLevel(findLocalTaskLinkForWorkspace(input.links, workspace)?.taskId)
        : null
      if (taskId) {
        unit.taskId = taskId
        break
      }
    }
    anchorTaskId = unit.taskId
  }
}

function groupKey(hostHeader: HostHeaderRow | null, taskId: string | null): string {
  const scope = hostHeader ? `${hostHeader.hostId}/` : ''
  return `${LOCAL_TASK_SIDEBAR_GROUP_PREFIX}${scope}${taskId ? `task:${taskId}` : 'none'}`
}

function buildGroups(units: readonly Unit[], hostHeader: HostHeaderRow | null): Group[] {
  const unitsByTask = new Map<string | null, Unit[]>()
  for (const unit of units) {
    if (!unit.dropped) {
      unitsByTask.set(unit.taskId, [...(unitsByTask.get(unit.taskId) ?? []), unit])
    }
  }
  // Tasks keep the order of their first workspace in the user's sort; the no-task group goes last.
  const ordered = [...unitsByTask].sort(
    ([left], [right]) => Number(left === null) - Number(right === null)
  )
  return ordered.map(([taskId, taskUnits]) => {
    const key = groupKey(hostHeader, taskId)
    const rows = taskUnits.flatMap((unit) => unit.rows)
    const header: LocalTaskSidebarHeaderRow = {
      type: 'header',
      key,
      count: rows.filter((row) => row.type === 'item' || row.type === 'folder-workspace').length,
      icon: { kind: 'all' },
      localTaskId: taskId,
      worktreeIds: rows.filter(isWorktreeRow).map((row) => row.worktree.id),
      ...(hostHeader ? { hostId: hostHeader.hostId } : {})
    }
    // Why rewrite sectionKey: drag groups, selection and lineage keys all read it as the section.
    return {
      header,
      rows: rows.map((row) => (row.type === 'item' ? { ...row, sectionKey: key } : row))
    }
  })
}

/** Regroups flat-mode rows under one header per task, keeping host sections as the outer tier. */
export function planLocalTaskSidebarGroups(
  rows: readonly HostSectionRow[],
  input: LocalTaskSidebarGroupingInput
): LocalTaskSidebarPlan {
  const rawSegments: { hostHeader: HostHeaderRow | null; rows: Row[] }[] = []
  let current: { hostHeader: HostHeaderRow | null; rows: Row[] } = { hostHeader: null, rows: [] }
  rawSegments.push(current)
  for (const row of rows) {
    if (row.type === 'host-header') {
      current = { hostHeader: row, rows: [] }
      rawSegments.push(current)
    } else {
      current.rows.push(row)
    }
  }
  const groupKeyByRowKey = new Map<string, string>()
  const groupsByWorkspaceId = new Map<string, WorkspacePlace[]>()
  const segments = rawSegments.map(({ hostHeader, rows: segmentRows }) => {
    const units = collectUnits(segmentRows)
    resolveUnitTasks(units, input)
    const groups = buildGroups(units, hostHeader)
    for (const { header, rows: groupRows } of groups) {
      for (const rowKey of collectRenderedSidebarRowKeys(groupRows)) {
        groupKeyByRowKey.set(rowKey, header.key)
      }
      for (const row of groupRows) {
        const workspace = rowWorkspace(row, input.defaultHostId)
        if (workspace) {
          const places = groupsByWorkspaceId.get(workspace.id) ?? []
          places.push({ hostId: workspace.hostId, key: header.key })
          groupsByWorkspaceId.set(workspace.id, places)
        }
      }
    }
    return { hostHeader, groups }
  })
  return { segments, groupKeyByRowKey, groupsByWorkspaceId }
}

/** The group holding a workspace, by its sidebar id and, when known, its host. */
export function findLocalTaskSidebarGroupKey(
  plan: LocalTaskSidebarPlan,
  workspaceId: string,
  hostId?: ExecutionHostId | null
): string | null {
  const places = plan.groupsByWorkspaceId.get(workspaceId) ?? []
  return places.find((place) => !hostId || place.hostId === hostId)?.key ?? null
}

export function renderLocalTaskSidebarGroups(
  plan: LocalTaskSidebarPlan,
  collapsed: ReadonlySet<string>
): HostSectionRow[] {
  const result: HostSectionRow[] = []
  for (const segment of plan.segments) {
    if (segment.hostHeader) {
      result.push(segment.hostHeader)
    }
    for (const { header, rows } of segment.groups) {
      result.push(header)
      if (!collapsed.has(header.key)) {
        result.push(...rows)
      }
    }
  }
  return result
}

export function isSidebarRow(row: HostSectionRow): row is Row {
  return row.type !== 'host-header'
}
