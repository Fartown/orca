import { createStore } from 'zustand/vanilla'
import type {
  GoalDetail,
  GoalListFilter,
  GoalOperation,
  GoalStatus,
  GoalSummary
} from '../../../shared/goals/goal-control-contract'

export type GoalRouteStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'degraded'
  | 'unavailable'
  | 'unsupported'
  | 'offline'

export type GoalScope = 'workspace' | 'all'

/**
 * What the editor opens with. A pane-scoped entry pins the session it came
 * from; a goalId turns the same form into "edit this goal's definition".
 */
export type GoalEditorPrefill = {
  worktreeId: string | null
  paneKey: string | null
  goalId?: string
}

export type GoalDomainState = {
  status: GoalRouteStatus
  statusReason: string | null
  supports: GoalStatus['supports'] | null
  summaries: GoalSummary[]
  listObservedAt: number | null
  detailsById: Record<string, GoalDetail>
  selectedGoalId: string | null
  scope: GoalScope
  filter: GoalListFilter
  query: string
  editor: { open: boolean; prefill: GoalEditorPrefill | null }
  /** Goal whose session is being changed; null when the rebind dialog is closed. */
  rebindGoalId: string | null
  /** Operations the host accepted but has not settled; polled until they land. */
  pendingOperations: Record<string, GoalOperation>
  setStatus: (
    status: GoalRouteStatus,
    reason?: string | null,
    supports?: GoalStatus['supports']
  ) => void
  applyList: (items: GoalSummary[], observedAt: number) => void
  applyDetail: (detail: GoalDetail) => void
  dropDetail: (goalId: string) => void
  select: (goalId: string | null) => void
  setScope: (scope: GoalScope) => void
  setFilter: (filter: GoalListFilter) => void
  setQuery: (query: string) => void
  openEditor: (prefill: GoalEditorPrefill | null) => void
  closeEditor: () => void
  openRebind: (goalId: string | null) => void
  trackOperation: (operation: GoalOperation) => void
  settleOperation: (clientOperationId: string) => void
}

export const goalDomainStore = createStore<GoalDomainState>((set) => ({
  status: 'idle',
  statusReason: null,
  supports: null,
  summaries: [],
  listObservedAt: null,
  detailsById: {},
  selectedGoalId: null,
  scope: 'workspace',
  filter: 'all',
  query: '',
  editor: { open: false, prefill: null },
  rebindGoalId: null,
  pendingOperations: {},
  setStatus: (status, reason = null, supports) =>
    set((state) =>
      state.status === status &&
      state.statusReason === reason &&
      (!supports || state.supports === supports)
        ? state
        : { status, statusReason: reason, ...(supports ? { supports } : {}) }
    ),
  // Why: the poll lands every few seconds; keep identity when nothing changed so rows don't re-render.
  applyList: (items, observedAt) =>
    set((state) =>
      sameSummaries(state.summaries, items)
        ? { listObservedAt: observedAt }
        : { summaries: items, listObservedAt: observedAt }
    ),
  applyDetail: (detail) =>
    set((state) => ({ detailsById: { ...state.detailsById, [detail.goalId]: detail } })),
  dropDetail: (goalId) =>
    set((state) => {
      if (!(goalId in state.detailsById)) {
        return state
      }
      const next = { ...state.detailsById }
      delete next[goalId]
      return { detailsById: next }
    }),
  select: (selectedGoalId) => set({ selectedGoalId }),
  setScope: (scope) => set({ scope }),
  setFilter: (filter) => set({ filter }),
  setQuery: (query) => set({ query }),
  openEditor: (prefill) => set({ editor: { open: true, prefill } }),
  closeEditor: () => set({ editor: { open: false, prefill: null } }),
  openRebind: (rebindGoalId) => set({ rebindGoalId }),
  trackOperation: (operation) =>
    set((state) => ({
      pendingOperations: { ...state.pendingOperations, [operation.clientOperationId]: operation }
    })),
  settleOperation: (clientOperationId) =>
    set((state) => {
      if (!(clientOperationId in state.pendingOperations)) {
        return state
      }
      const next = { ...state.pendingOperations }
      delete next[clientOperationId]
      return { pendingOperations: next }
    })
}))

function sameSummaries(previous: GoalSummary[], next: GoalSummary[]): boolean {
  if (previous.length !== next.length) {
    return false
  }
  return previous.every((item, index) => {
    const other = next[index]
    return (
      item.goalId === other.goalId &&
      item.phase === other.phase &&
      item.reason === other.reason &&
      item.continuation === other.continuation &&
      item.runtimeFence === other.runtimeFence &&
      item.runId === other.runId &&
      item.turns === other.turns &&
      item.activeMs === other.activeMs &&
      item.agentStatus === other.agentStatus &&
      item.turn === other.turn &&
      item.driver.status === other.driver.status &&
      item.terminal.status === other.terminal.status &&
      item.archived === other.archived &&
      item.objectivePreview === other.objectivePreview
    )
  })
}
