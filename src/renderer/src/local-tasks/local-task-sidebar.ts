import { useEffect, useMemo } from 'react'
import { useStore } from 'zustand'
import { useAppStore } from '@/store'
import { collectRenderedSidebarRowKeys } from '@/components/sidebar/worktree-list/listing/rendered-row-keys'
import type {
  SidebarListModel,
  SidebarListModelArgs
} from '@/components/sidebar/worktree-list/listing/sidebar-list-model'
import type { ExecutionHostId } from '../../../shared/execution-host'
import type { WorktreeGroupBy } from '../../../shared/sidebar-list/row-types'
import type { LocalTaskLinks } from '../../../shared/local-tasks/local-task-link-types'
import type { LocalTask } from '../../../shared/local-tasks/local-task-types'
import { useLocalTasksDomain } from './local-tasks-domain-store'
import { localTaskIdForCreation } from './local-task-start-work'
import {
  localTaskIdForStartedWorkspace,
  localTaskStartedWorkspaceStore,
  type LocalTaskStartedWorkspace
} from './local-task-started-workspaces'
import {
  chooseLocalTaskSidebarGrouping,
  localTaskSidebarCollapseStore,
  useLocalTaskSidebarGrouping
} from './local-task-sidebar-grouping'
import {
  findLocalTaskSidebarGroupKey,
  isSidebarRow,
  planLocalTaskSidebarGroups,
  renderLocalTaskSidebarGroups,
  withoutLaneCollapse
} from './local-task-sidebar-groups'

type SidebarRowModel = SidebarListModel['rowModel']

const NO_TASKS: LocalTask[] = []
const NO_LINKS: LocalTaskLinks = { workspaces: [], sessions: [] }
const NO_COLLAPSED: ReadonlySet<string> = new Set()
const NO_STARTED: readonly LocalTaskStartedWorkspace[] = []
// Upstream reveals these headers by switching to Project grouping, which task grouping would mask.
const PROJECT_HEADER_ROW_PREFIXES = ['sidebar-name:', 'project-group:', 'project:', 'repo:']

/** Upstream's groupBy, or flat while the sidebar groups by task: upstream never stores that choice. */
export function useSidebarTaskGroupBy(): WorktreeGroupBy {
  const groupBy = useAppStore((s) => s.groupBy)
  return useLocalTaskSidebarGrouping() === 'on' ? 'none' : groupBy
}

/**
 * Rewrites the flat list model's rows into task groups. Off, it returns the model it was given.
 * Folded groups open for a reveal or an agent-send target, as upstream does for its own groups.
 */
export function useLocalTaskGroupedRowModel(
  rowModel: SidebarRowModel,
  options: {
    enabled: boolean
    defaultHostId: ExecutionHostId
    agentSendTargetWorktreeId: string | null
  }
): SidebarRowModel {
  const { enabled, defaultHostId, agentSendTargetWorktreeId } = options
  const tasks = useLocalTasksDomain((state) => (enabled ? state.tasks : NO_TASKS))
  const links = useLocalTasksDomain((state) => (enabled ? state.links : NO_LINKS))
  const collapsed = useStore(localTaskSidebarCollapseStore, (state) =>
    enabled ? state.collapsed : NO_COLLAPSED
  )
  const started = useStore(localTaskStartedWorkspaceStore, (state) =>
    enabled ? state.started : NO_STARTED
  )
  const pendingRevealWorktree = useAppStore((s) => s.pendingRevealWorktree)
  const pendingRevealSidebarRow = useAppStore((s) => s.pendingRevealSidebarRow)
  const input = useMemo(
    () => ({
      tasks,
      links,
      defaultHostId,
      taskIdForCreation: localTaskIdForCreation,
      taskIdForStartedWorkspace: (workspace: { id: string; hostId: string }) =>
        localTaskIdForStartedWorkspace(started, workspace)
    }),
    [tasks, links, defaultHostId, started]
  )
  const plan = useMemo(
    () => (enabled ? planLocalTaskSidebarGroups(rowModel.sectionRows, input) : null),
    [enabled, rowModel.sectionRows, input]
  )
  const flatPlan = useMemo(
    () => (enabled ? planLocalTaskSidebarGroups(rowModel.rows, input) : null),
    [enabled, rowModel.rows, input]
  )
  const effectiveCollapsed = useMemo(() => {
    const forcedOpen =
      plan && agentSendTargetWorktreeId
        ? findLocalTaskSidebarGroupKey(plan, agentSendTargetWorktreeId)
        : null
    if (!forcedOpen || !collapsed.has(forcedOpen)) {
      return collapsed
    }
    const next = new Set(collapsed)
    next.delete(forcedOpen)
    return next
  }, [plan, agentSendTargetWorktreeId, collapsed])

  useEffect(() => {
    if (!plan || !pendingRevealWorktree) {
      return
    }
    const key = findLocalTaskSidebarGroupKey(
      plan,
      pendingRevealWorktree.worktreeId,
      pendingRevealWorktree.executionHostId
    )
    if (key) {
      localTaskSidebarCollapseStore.getState().expand(key)
    }
  }, [plan, pendingRevealWorktree])

  useEffect(() => {
    if (!plan || !pendingRevealSidebarRow) {
      return
    }
    const { rowKey } = pendingRevealSidebarRow
    if (PROJECT_HEADER_ROW_PREFIXES.some((prefix) => rowKey.startsWith(prefix))) {
      chooseLocalTaskSidebarGrouping(false)
      return
    }
    const key = plan.groupKeyByRowKey.get(rowKey)
    if (key) {
      localTaskSidebarCollapseStore.getState().expand(key)
    }
  }, [plan, pendingRevealSidebarRow])

  return useMemo(() => {
    if (!plan || !flatPlan) {
      return rowModel
    }
    const sectionRows = renderLocalTaskSidebarGroups(plan, effectiveCollapsed)
    return {
      ...rowModel,
      rows: renderLocalTaskSidebarGroups(flatPlan, effectiveCollapsed).filter(isSidebarRow),
      sectionRows,
      renderedSidebarRowKeys: collectRenderedSidebarRowKeys(sectionRows)
    }
  }, [rowModel, plan, flatPlan, effectiveCollapsed])
}

/** Wraps a sidebar list model so its rows group by task while that grouping is on. */
export function withSidebarTaskGroups(
  useListModel: (args: SidebarListModelArgs) => SidebarListModel
): (args: SidebarListModelArgs) => SidebarListModel {
  return function useTaskGroupedSidebarListModel(args) {
    const enabled = useLocalTaskSidebarGrouping() === 'on' && args.groupBy === 'none'
    const collapsedGroups = useMemo(
      () => (enabled ? withoutLaneCollapse(args.collapsedGroups) : args.collapsedGroups),
      [enabled, args.collapsedGroups]
    )
    const model = useListModel(
      collapsedGroups === args.collapsedGroups ? args : { ...args, collapsedGroups }
    )
    const rowModel = useLocalTaskGroupedRowModel(model.rowModel, {
      enabled,
      defaultHostId: args.defaultHostId,
      agentSendTargetWorktreeId: args.agentSendTargetWorktreeId
    })
    return rowModel === model.rowModel ? model : { ...model, rowModel }
  }
}
