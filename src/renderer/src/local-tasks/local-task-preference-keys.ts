import { LOCAL_TASK_SOURCE_HIDDEN_PREFERENCE_KEY } from '../../../shared/local-tasks/local-task-source-visibility'
import { LOCAL_TASK_CARD_SHOW_PREFERENCE_KEY } from '../../../shared/local-tasks/local-task-card-display'

/** Desktop UI choices kept in the task library's preferences, so they follow the library. */
export const LOCAL_ACTIVE_PREFERENCE_KEY = 'taskPageLocalActive'
export const GROUP_BY_PREFERENCE_KEY = 'taskPageGroupBy'
export const SORT_BY_PREFERENCE_KEY = 'taskPageSortBy'
/** `'1'` while the sidebar groups workspaces by task; upstream `groupBy` never learns this value. */
export const SIDEBAR_GROUP_BY_TASK_PREFERENCE_KEY = 'sidebarGroupByTask'
/** `'0'` while sidebar cards hide the task chip; absent (the default) shows it. */
export const CARD_SHOW_LOCAL_TASK_PREFERENCE_KEY = LOCAL_TASK_CARD_SHOW_PREFERENCE_KEY

export const LOCAL_TASK_PREFERENCE_KEYS = [
  LOCAL_ACTIVE_PREFERENCE_KEY,
  GROUP_BY_PREFERENCE_KEY,
  SORT_BY_PREFERENCE_KEY,
  SIDEBAR_GROUP_BY_TASK_PREFERENCE_KEY,
  LOCAL_TASK_SOURCE_HIDDEN_PREFERENCE_KEY,
  CARD_SHOW_LOCAL_TASK_PREFERENCE_KEY
]
