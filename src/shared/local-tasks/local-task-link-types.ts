export type LocalTaskWorkspaceKind = 'git-worktree' | 'folder'

/** How a link was made: from the task's Start, or by picking an existing workspace or session. */
export type LocalTaskLinkOrigin = 'start' | 'manual'

/**
 * A task's own workspace; any level may hold one. Host ids here and on sessions are relative to the
 * Orca that owns the library: `local` or one of its SSH targets `ssh:{t}`, one spelling per host.
 */
export type LocalTaskWorkspaceLink = {
  taskId: string
  hostId: string
  kind: LocalTaskWorkspaceKind
  /** Durable worktree identity that survives renames and host reassignment; null until a client resolves it. */
  instanceId: string | null
  worktreeId: string | null
  folderWorkspaceId: string | null
  repoId: string | null
  branchSnapshot: string | null
  nameSnapshot: string | null
  hostLabelSnapshot: string | null
  linkedVia: LocalTaskLinkOrigin
  linkedAt: number
}

export type LocalTaskSessionSurface = 'terminal' | 'chat'

/** An agent session opened for a task, inside its own workspace or the nearest ancestor's. */
export type LocalTaskSessionLink = {
  id: string
  taskId: string
  hostId: string
  worktreeId: string | null
  instanceId: string | null
  surface: LocalTaskSessionSurface
  tabId: string | null
  /** The owning host's own `tabId:leafId`, its agent status key; the host fills it once the pane reports. */
  paneKey: string | null
  sessionId: string | null
  providerSession: string | null
  agent: string | null
  linkedVia: LocalTaskLinkOrigin
  openedAt: number
}

export type LocalTaskLinks = {
  workspaces: LocalTaskWorkspaceLink[]
  sessions: LocalTaskSessionLink[]
}

/**
 * What the library's host says about a linked session. `unverifiable` when the session's host is out
 * of the owner's contact (an SSH target), `exited` when the agent ended, `missing` when the tab is
 * gone, `idle` for a decayed or sleeping run, `unknown` when the host cannot tell (no status hooks,
 * not yet reported, or not yet claimed). A client marks a whole endpoint unverifiable on its own.
 */
export type LocalTaskSessionState =
  | 'working'
  | 'waiting'
  | 'blocked'
  | 'done'
  | 'idle'
  | 'exited'
  | 'missing'
  | 'unknown'
  | 'unverifiable'

export type LocalTaskSessionProgress = {
  taskSessionId: string
  state: LocalTaskSessionState
  lastMessage: string | null
  stateSince: number | null
  /** A finished turn nobody marked seen in this library. */
  unread: boolean
}

export type LocalTaskAttentionKind = 'approval' | 'question' | 'blocked' | 'unread-done'

export type LocalTaskAttentionItem = {
  /** `{host paneKey}@{stateStartedAt}`: a new wait of the same session is a new item. */
  key: string
  taskId: string
  taskSessionId: string
  kind: LocalTaskAttentionKind
  agent: string | null
  lastMessage: string | null
  since: number
  /** Only a finished-but-unread turn takes a typed reply; every other kind is handled in the session. */
  replyable: boolean
}

/** `attention.get`: judged live by the library's host from its own agent status. */
export type LocalTaskProgressSnapshot = {
  /** Host clock when it was judged. */
  observedAt: number
  sessions: LocalTaskSessionProgress[]
  /** Seen and snoozed items already removed. */
  items: LocalTaskAttentionItem[]
}
