import { getExecutionHostIdForWorktree } from '../lib/worktree-runtime-owner'
import { getActiveSidebarWorkspaceId } from '../../../shared/workspace-scope'
import { useGoalEditorDraftSync } from './goal-editor-drafts-sync'
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useStore } from 'zustand'
import { isLegacyGoalId } from '../../../shared/goals/goal-control-contract'
import { useAppStore } from '../store'
import {
  getGoalRuntimeClient,
  GoalRuntimeClient,
  GoalRuntimeUnsupportedError
} from './goal-runtime-client'
import { goalDomainStore } from './goals-domain-store'
import { GoalNoticeWatcher } from './GoalNoticeWatcher'

const VISIBLE_POLL_MS = 5_000
const HIDDEN_POLL_MS = 30_000
const PENDING_OPERATION_POLL_MS = 1_000

/**
 * Same shape as IssueDomainSyncGate: route-driven polling with a sequence guard
 * so a late response never overwrites a newer one. Hidden panels still refresh
 * slowly so the pane header can tell a bound session from an unbound one.
 */
export function GoalDomainSyncGate(): React.JSX.Element {
  const workspaceId = useAppStore((s) =>
    getActiveSidebarWorkspaceId(s.activeWorkspaceKey, s.activeWorktreeId)
  )
  const route = useAppStore((s) => getExecutionHostIdForWorktree(s, workspaceId))
  const client = useMemo(() => new GoalRuntimeClient(route), [route])
  useEffect(() => goalDomainStore.getState().setRoute(route), [route])
  useGoalEditorDraftSync(client)
  const rightSidebarOpen = useAppStore((s) => s.rightSidebarOpen)
  const rightSidebarTab = useAppStore((s) => s.rightSidebarTab)
  const scope = useStore(goalDomainStore, (s) => s.scope)
  const filter = useStore(goalDomainStore, (s) => s.filter)
  const query = useStore(goalDomainStore, (s) => s.query)
  const selectedGoalId = useStore(goalDomainStore, (s) => s.selectedGoalId)
  const pendingCount = useStore(goalDomainStore, (s) => Object.keys(s.pendingOperations).length)
  const listSequence = useRef(0)
  const detailSequence = useRef(0)
  const visible = rightSidebarOpen && rightSidebarTab === 'goals'
  const worktree = scope === 'workspace' ? workspaceId : null

  useEffect(() => {
    let disposed = false
    const refresh = async (): Promise<void> => {
      if (disposed) {
        return
      }
      await refreshList(
        client,
        worktree,
        filter,
        query,
        ++listSequence.current,
        listSequence,
        () => disposed
      )
    }
    void refresh()
    const timer = window.setInterval(
      () => void refresh(),
      visible ? VISIBLE_POLL_MS : HIDDEN_POLL_MS
    )
    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [client, filter, query, visible, worktree])

  useEffect(() => {
    if (!selectedGoalId || !visible) {
      return
    }
    let disposed = false
    const refresh = async (): Promise<void> => {
      if (disposed) {
        return
      }
      await refreshDetail(
        selectedGoalId,
        ++detailSequence.current,
        detailSequence,
        client,
        () => disposed
      )
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), VISIBLE_POLL_MS)
    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [client, selectedGoalId, visible])

  useEffect(() => {
    if (pendingCount === 0) {
      return
    }
    const timer = window.setInterval(
      () => void settlePendingOperations(client),
      PENDING_OPERATION_POLL_MS
    )
    return () => window.clearInterval(timer)
  }, [client, pendingCount])

  // Notices follow every execution host, not this route; see GoalNoticeWatcher.
  return <GoalNoticeWatcher />
}

async function refreshList(
  client: GoalRuntimeClient,
  worktree: string | null,
  filter: Parameters<GoalRuntimeClient['list']>[0]['filter'],
  query: string,
  sequence: number,
  sequenceRef: MutableRefObject<number>,
  disposed: () => boolean
): Promise<void> {
  const actions = goalDomainStore.getState()
  if (actions.status === 'idle') {
    actions.setStatus('loading')
  }
  try {
    const status = await client.status()
    if (
      disposed() ||
      sequence !== sequenceRef.current ||
      goalDomainStore.getState().routeExecutionHostId !== client.routeExecutionHostId
    ) {
      return
    }
    if (status.status === 'unavailable') {
      actions.setStatus('unavailable', status.reason, status.supports)
      return
    }
    actions.setStatus(status.status, status.reason, status.supports)
    const list = await client.list({
      filter,
      ...(worktree ? { worktree } : {}),
      ...(query.trim() ? { query: query.trim() } : {})
    })
    if (
      disposed() ||
      sequence !== sequenceRef.current ||
      goalDomainStore.getState().routeExecutionHostId !== client.routeExecutionHostId
    ) {
      return
    }
    actions.applyList(list.items, list.observedAt)
  } catch (error) {
    if (
      disposed() ||
      sequence !== sequenceRef.current ||
      goalDomainStore.getState().routeExecutionHostId !== client.routeExecutionHostId
    ) {
      return
    }
    if (error instanceof GoalRuntimeUnsupportedError) {
      actions.setStatus('unsupported', error.message)
    } else {
      actions.setStatus('offline', error instanceof Error ? error.message : String(error))
    }
  }
}

export async function refreshDetail(
  goalId: string,
  sequence: number,
  sequenceRef: MutableRefObject<number>,
  client: GoalRuntimeClient = getGoalRuntimeClient(),
  disposed: () => boolean = () => false
): Promise<void> {
  // Why: legacy CLI goals have no managed record to fetch; they are imported, not opened.
  if (isLegacyGoalId(goalId)) {
    return
  }
  try {
    const detail = await client.get(goalId)
    if (
      disposed() ||
      sequence !== sequenceRef.current ||
      goalDomainStore.getState().routeExecutionHostId !== client.routeExecutionHostId
    ) {
      return
    }
    if (detail) {
      goalDomainStore.getState().applyDetail(detail)
    } else {
      goalDomainStore.getState().dropDetail(goalId)
    }
  } catch {
    // The list poll owns status reporting; a detail miss just keeps the last snapshot.
  }
}

/** Refresh one goal outside the poll cadence, right after a control lands. */
export function requestGoalDetailRefresh(
  goalId: string,
  client: GoalRuntimeClient = getGoalRuntimeClient()
): void {
  const ref: MutableRefObject<number> = { current: 0 }
  void refreshDetail(goalId, 0, ref, client)
}

async function settlePendingOperations(client: GoalRuntimeClient): Promise<void> {
  const state = goalDomainStore.getState()
  for (const pending of Object.values(state.pendingOperations)) {
    try {
      const latest = await client.operation(pending.clientOperationId)
      if (goalDomainStore.getState().routeExecutionHostId !== client.routeExecutionHostId) {
        return
      }
      if (!latest || latest.status === 'accepted' || latest.status === 'applying') {
        continue
      }
      goalDomainStore.getState().settleOperation(pending.clientOperationId)
      if (latest.goalId) {
        requestGoalDetailRefresh(latest.goalId, client)
      }
    } catch {
      // Keep polling; the host reports status through the list refresh.
    }
  }
}
