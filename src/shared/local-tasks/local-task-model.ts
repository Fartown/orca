/** Pure task-library vocabulary shared by the desktop host, its renderer and the phone. */

export const LOCAL_TASK_STATUS_CATEGORIES = [
  'backlog',
  'unstarted',
  'started',
  'review',
  'completed',
  'canceled'
] as const
export type LocalTaskStatusCategory = (typeof LOCAL_TASK_STATUS_CATEGORIES)[number]

/** 0 none, 1 urgent, 2 high, 3 medium, 4 low — the order Linear users expect. */
export const LOCAL_TASK_PRIORITIES = [0, 1, 2, 3, 4] as const
export type LocalTaskPriority = (typeof LOCAL_TASK_PRIORITIES)[number]

// Why: names map to design-system tokens in the UI; storing a hex would let data bypass the palette.
export const LOCAL_TASK_STATUS_COLORS = [
  'gray',
  'blue',
  'yellow',
  'orange',
  'green',
  'red',
  'purple'
] as const
export type LocalTaskStatusColor = (typeof LOCAL_TASK_STATUS_COLORS)[number]

export type DefaultLocalTaskStatus = {
  category: LocalTaskStatusCategory
  name: string
  color: LocalTaskStatusColor
}

// Why: stored names are user data; the creating client passes translated names and these are the fallback.
export const DEFAULT_LOCAL_TASK_STATUSES: readonly DefaultLocalTaskStatus[] = [
  { category: 'backlog', name: 'Backlog', color: 'gray' },
  { category: 'unstarted', name: 'Todo', color: 'gray' },
  { category: 'started', name: 'In Progress', color: 'yellow' },
  { category: 'review', name: 'In Review', color: 'blue' },
  { category: 'completed', name: 'Done', color: 'green' },
  { category: 'canceled', name: 'Canceled', color: 'gray' }
]

export const LOCAL_TASK_TITLE_MAX = 300
export const LOCAL_TASK_DESCRIPTION_MAX = 20_000
export const LOCAL_TASK_CRITERIA_MAX = 50
export const LOCAL_TASK_CRITERION_MAX = 500
export const LOCAL_TASK_LABELS_MAX = 20
export const LOCAL_TASK_LABEL_MAX = 40
export const LOCAL_TASK_COMMENT_MAX = 20_000
export const LOCAL_TASK_PROJECT_NAME_MAX = 80
export const LOCAL_TASK_STATUS_NAME_MAX = 40
export const LOCAL_TASK_BATCH_MAX = 100

const PREFIX_PATTERN = /^[A-Z][A-Z0-9]{0,9}$/

/** Prefixes are 1-10 upper-case ASCII letters or digits, starting with a letter. */
export function normalizeLocalTaskPrefix(input: string): string | null {
  const prefix = input.trim().toUpperCase()
  return PREFIX_PATTERN.test(prefix) ? prefix : null
}

export function formatLocalTaskRef(prefix: string, taskNumber: number): string {
  return `${prefix}-${taskNumber}`
}

export type ParsedLocalTaskRef = { prefix: string; taskNumber: number }

/** Accepts `SHOP-12` in any case; returns null for anything that is not a task reference. */
export function parseLocalTaskRef(input: string): ParsedLocalTaskRef | null {
  const match = /^([A-Za-z][A-Za-z0-9]{0,9})-(\d{1,9})$/.exec(input.trim())
  if (!match) {
    return null
  }
  const taskNumber = Number(match[2])
  if (!Number.isSafeInteger(taskNumber) || taskNumber < 1) {
    return null
  }
  return { prefix: match[1].toUpperCase(), taskNumber }
}

const WORKSPACE_NAME_MAX = 48

/**
 * `SHOP-12` + `订单导出支持 CSV` → `shop-12-csv`. Non-ASCII words drop out because
 * branch names must stay portable across Git hosts; the ref alone is always kept.
 */
export function suggestLocalTaskWorkspaceName(ref: string, title: string): string {
  const base = ref.toLowerCase()
  const words = title
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const name = words ? `${base}-${words}` : base
  return name.slice(0, WORKSPACE_NAME_MAX).replace(/-+$/g, '')
}

export function isTerminalLocalTaskCategory(category: LocalTaskStatusCategory): boolean {
  return category === 'completed' || category === 'canceled'
}
