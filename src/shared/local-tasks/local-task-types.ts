import type {
  LocalTaskPriority,
  LocalTaskStatusCategory,
  LocalTaskStatusColor
} from './local-task-model'

export type LocalTaskStatusDef = {
  id: string
  projectId: string
  category: LocalTaskStatusCategory
  name: string
  color: LocalTaskStatusColor
  position: number
}

export type LocalTaskProjectRules = {
  startMovesToInProgress: boolean
  prMergedCompletes: boolean
}

export type LocalTaskProject = {
  id: string
  name: string
  prefix: string
  /** Earlier prefixes; refs written with them still resolve to this project. */
  aliases: string[]
  /**
   * Orca project ids (the sidebar's projects, e.g. `github:acme/shop`) on this library's host, in
   * link order; empty for a project that only tracks tasks. Several task projects may share one.
   */
  repos: string[]
  /** One of `repos`, the one Start preselects; null exactly when `repos` is empty. */
  defaultRepoId: string | null
  /** Host-relative (`local` / `ssh:{t}`) host the last Start ran on. */
  lastExecutionHostId: string | null
  rules: LocalTaskProjectRules
  statuses: LocalTaskStatusDef[]
  createdAt: number
  updatedAt: number
  revision: number
}

export type LocalTask = {
  id: string
  projectId: string
  number: number
  /** Display ref with the project's current prefix, e.g. `SHOP-12`. */
  ref: string
  title: string
  description: string
  criteria: string[]
  statusId: string
  priority: LocalTaskPriority
  labels: string[]
  parentId: string | null
  createdAt: number
  updatedAt: number
  revision: number
  /** Refs it had before moving to another project, e.g. `SHOP-1`; absent when it never moved. */
  formerRefs?: string[]
}

export type LocalTaskEventKind =
  | 'comment'
  | 'created'
  | 'title'
  | 'description'
  | 'criteria'
  | 'status'
  | 'priority'
  | 'labels'
  | 'parent'
  | 'moved'
  | 'workspace-linked'
  | 'workspace-unlinked'
  | 'workspace-host'
  | 'session-linked'
  | 'session-unlinked'

export type LocalTaskEventSource = 'desktop' | 'mobile' | 'cli' | 'rule'

export type LocalTaskEvent = {
  id: string
  taskId: string
  kind: LocalTaskEventKind
  source: LocalTaskEventSource
  body: string | null
  payload: Record<string, unknown> | null
  createdAt: number
  editedAt: number | null
}

export type LocalTasksHostState =
  | 'not-task-host'
  | 'starting'
  | 'ready'
  | 'read-only'
  | 'unavailable'

export type LocalTasksStatus = {
  taskHost: boolean
  state: LocalTasksHostState
  reason: string | null
  revision: number
  /** Identity of this task library; a rebuilt database gets a new one. */
  taskHostId: string | null
  /** Optional for older hosts; counts tasks whose status category is started. */
  inProgressCount?: number
}

export type LocalTaskFailureCode =
  | 'invalid_argument'
  | 'not_found'
  | 'stale'
  | 'read_only'
  | 'prefix_taken'
  | 'prefix_history_in_project'
  | 'prefix_invalid'
  | 'parent_invalid'
  | 'status_invalid'
  | 'status_in_use'
  | 'last_status_in_category'
  | 'comment_not_editable'
  | 'workspace_already_linked'
  | 'task_has_workspace'
  | 'workspace_required'
  | 'session_already_linked'
  | 'host_not_owned'
  | 'desktop_only'
  | 'attention_item_mismatch'

export type LocalTaskFailure = {
  ok: false
  code: LocalTaskFailureCode
  /** Ref or name the UI can show, e.g. the project that owns a prefix. */
  detail?: string
}

export type LocalTaskResult<T> = ({ ok: true } & T) | LocalTaskFailure

export type LocalTaskChangeScope =
  | 'projects'
  | 'tasks'
  | 'events'
  | 'preferences'
  | 'links'
  | 'attention'

export type LocalTaskChangeMessage =
  | { type: 'ready'; subscriptionId: string; revision: number; state: LocalTasksHostState }
  | { type: 'changed'; revision: number; scopes: LocalTaskChangeScope[] | null }
  | { type: 'end' }
