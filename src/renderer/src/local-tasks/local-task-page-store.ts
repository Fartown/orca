import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import type {
  LocalTaskPriority,
  LocalTaskStatusCategory
} from '../../../shared/local-tasks/local-task-model'

/** Left-rail views; every one but `all` is one status category (REQ-006). */
export const LOCAL_TASK_VIEWS = ['all', 'started', 'backlog', 'completed', 'canceled'] as const
export type LocalTaskView = (typeof LOCAL_TASK_VIEWS)[number]
/** What the rail shows: a status view, or the sessions waiting on the user (REQ-014). */
export type LocalTaskPageView = LocalTaskView | 'needs-you'

/** List grouping; `status` means statuses in one project and categories across projects. */
export const LOCAL_TASK_GROUP_BYS = ['status', 'priority', 'project', 'none'] as const
export type LocalTaskGroupBy = (typeof LOCAL_TASK_GROUP_BYS)[number]

/** Row order inside a group or board column. */
export const LOCAL_TASK_SORT_BYS = ['updated', 'created', 'priority', 'number'] as const
export type LocalTaskSortBy = (typeof LOCAL_TASK_SORT_BYS)[number]

export type LocalTaskFilters = {
  priorities: LocalTaskPriority[]
  labels: string[]
  categories: LocalTaskStatusCategory[]
  /** Only tasks with a session in Needs you (REQ-012). */
  needsYou: boolean
}

export type LocalTaskPickerKind = 'status' | 'priority' | 'labels'

export type LocalTaskCreateDefaults = {
  projectId: string | null
  statusId: string | null
  priority: LocalTaskPriority | null
  parentId: string | null
}

export const EMPTY_LOCAL_TASK_FILTERS: LocalTaskFilters = {
  priorities: [],
  labels: [],
  categories: [],
  needsYou: false
}

export type LocalTaskPageState = {
  /** Whether the task page shows the local source; persisted as `taskPageLocalActive`. */
  localActive: boolean
  scopeProjectId: string | null
  view: LocalTaskPageView
  layout: 'list' | 'board'
  groupBy: LocalTaskGroupBy
  sortBy: LocalTaskSortBy
  showCanceledColumn: boolean
  filters: LocalTaskFilters
  query: string
  cursorTaskId: string | null
  detailTaskId: string | null
  previewOpen: boolean
  selectedTaskIds: string[]
  collapsedGroupKeys: string[]
  /** Tasks whose subtree the list folds away (REQ-004). */
  collapsedTaskIds: string[]
  commentBusyTaskIds: string[]
  commentDrafts: Record<string, string>
  create: { open: boolean; defaults: LocalTaskCreateDefaults }
  picker: { kind: LocalTaskPickerKind; taskIds: string[] } | null
  filterOpen: boolean
  /** Bumped to ask the toolbar to focus its search field. */
  searchFocusRequest: number
  consumedSearchFocusRequest: number
  setLocalActive: (localActive: boolean) => void
  setScope: (scopeProjectId: string | null, view?: LocalTaskPageView) => void
  setView: (view: LocalTaskPageView) => void
  setLayout: (layout: 'list' | 'board') => void
  setGroupBy: (groupBy: LocalTaskGroupBy) => void
  setSortBy: (sortBy: LocalTaskSortBy) => void
  setShowCanceledColumn: (show: boolean) => void
  setFilters: (filters: LocalTaskFilters) => void
  setQuery: (query: string) => void
  setCursor: (taskId: string | null) => void
  openDetail: (taskId: string | null) => void
  setPreviewOpen: (open: boolean) => void
  toggleSelected: (taskId: string) => void
  clearSelection: () => void
  toggleGroupCollapsed: (key: string) => void
  toggleTaskCollapsed: (taskId: string) => void
  setCommentBusy: (taskId: string, busy: boolean) => void
  setCommentDraft: (taskId: string, body: string) => void
  clearTransientUi: () => void
  openCreate: (defaults?: Partial<LocalTaskCreateDefaults>) => void
  closeCreate: () => void
  openPicker: (kind: LocalTaskPickerKind, taskIds: string[]) => void
  closePicker: () => void
  setFilterOpen: (open: boolean) => void
  requestSearchFocus: () => void
  consumeSearchFocus: (request: number) => void
}

export const localTaskPageStore = createStore<LocalTaskPageState>((set) => ({
  localActive: false,
  scopeProjectId: null,
  view: 'all',
  layout: 'list',
  groupBy: 'status',
  sortBy: 'updated',
  showCanceledColumn: false,
  filters: EMPTY_LOCAL_TASK_FILTERS,
  query: '',
  cursorTaskId: null,
  detailTaskId: null,
  previewOpen: false,
  selectedTaskIds: [],
  collapsedGroupKeys: [],
  collapsedTaskIds: [],
  commentBusyTaskIds: [],
  commentDrafts: {},
  create: {
    open: false,
    defaults: { projectId: null, statusId: null, priority: null, parentId: null }
  },
  picker: null,
  filterOpen: false,
  searchFocusRequest: 0,
  consumedSearchFocusRequest: 0,
  setLocalActive: (localActive) => set({ localActive }),
  setScope: (scopeProjectId, view) =>
    set((state) => ({
      scopeProjectId,
      view: view ?? state.view,
      detailTaskId: null,
      selectedTaskIds: []
    })),
  setView: (view) => set({ view, detailTaskId: null, selectedTaskIds: [] }),
  setLayout: (layout) => set({ layout }),
  setGroupBy: (groupBy) => set({ groupBy }),
  setSortBy: (sortBy) => set({ sortBy }),
  setShowCanceledColumn: (showCanceledColumn) => set({ showCanceledColumn }),
  setFilters: (filters) => set({ filters }),
  setQuery: (query) => set({ query }),
  setCursor: (cursorTaskId) => set({ cursorTaskId }),
  openDetail: (detailTaskId) =>
    set((state) => ({
      detailTaskId,
      previewOpen: false,
      cursorTaskId: detailTaskId ?? state.cursorTaskId
    })),
  setPreviewOpen: (previewOpen) => set({ previewOpen }),
  toggleSelected: (taskId) =>
    set((state) => ({
      selectedTaskIds: state.selectedTaskIds.includes(taskId)
        ? state.selectedTaskIds.filter((id) => id !== taskId)
        : [...state.selectedTaskIds, taskId]
    })),
  clearSelection: () => set({ selectedTaskIds: [] }),
  toggleGroupCollapsed: (key) =>
    set((state) => ({
      collapsedGroupKeys: state.collapsedGroupKeys.includes(key)
        ? state.collapsedGroupKeys.filter((item) => item !== key)
        : [...state.collapsedGroupKeys, key]
    })),
  toggleTaskCollapsed: (taskId) =>
    set((state) => ({
      collapsedTaskIds: state.collapsedTaskIds.includes(taskId)
        ? state.collapsedTaskIds.filter((id) => id !== taskId)
        : [...state.collapsedTaskIds, taskId]
    })),
  setCommentBusy: (taskId, busy) =>
    set((state) => ({
      commentBusyTaskIds: busy
        ? [...new Set([...state.commentBusyTaskIds, taskId])]
        : state.commentBusyTaskIds.filter((id) => id !== taskId)
    })),
  setCommentDraft: (taskId, body) =>
    set((state) => ({ commentDrafts: { ...state.commentDrafts, [taskId]: body } })),
  clearTransientUi: () =>
    set((state) => ({
      cursorTaskId: null,
      detailTaskId: null,
      previewOpen: false,
      selectedTaskIds: [],
      create: { ...state.create, open: false },
      picker: null,
      filterOpen: false,
      commentDrafts: {},
      searchFocusRequest: state.consumedSearchFocusRequest
    })),
  openCreate: (defaults) =>
    set({
      create: {
        open: true,
        defaults: {
          projectId: defaults?.projectId ?? null,
          statusId: defaults?.statusId ?? null,
          priority: defaults?.priority ?? null,
          parentId: defaults?.parentId ?? null
        }
      }
    }),
  closeCreate: () => set((state) => ({ create: { ...state.create, open: false } })),
  openPicker: (kind, taskIds) => set(taskIds.length > 0 ? { picker: { kind, taskIds } } : {}),
  closePicker: () => set({ picker: null }),
  setFilterOpen: (filterOpen) => set({ filterOpen }),
  requestSearchFocus: () => set((state) => ({ searchFocusRequest: state.searchFocusRequest + 1 })),
  consumeSearchFocus: (request) =>
    set((state) => ({
      consumedSearchFocusRequest: Math.max(state.consumedSearchFocusRequest, request)
    }))
}))

export function useLocalTaskPage<T>(selector: (state: LocalTaskPageState) => T): T {
  return useStore(localTaskPageStore, selector)
}
