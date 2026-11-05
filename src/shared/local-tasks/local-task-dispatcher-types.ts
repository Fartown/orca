import type { LocalTaskProposalItem } from './local-task-dispatcher-rpc-params'
import type { LocalTaskEventSource } from './local-task-types'

/** The dispatcher session's conversation, found by the pane it runs in. */
export type LocalTaskConversation = {
  id: string
  paneKey: string
  agent: string | null
  createdAt: number
  updatedAt: number
}

/** `executing`: a desktop claimed it and is running it, or was interrupted while it did. */
export type LocalTaskProposalStatus =
  | 'pending'
  | 'confirmed'
  | 'executing'
  | 'dismissed'
  | 'executed'

export type LocalTaskProposalItemResult = {
  index: number
  ok: boolean
  taskId?: string
  detail?: string
}

export type LocalTaskProposal = {
  id: string
  conversationId: string
  summary: string | null
  items: LocalTaskProposalItem[]
  status: LocalTaskProposalStatus
  /** The items a person kept when confirming; null keeps them all. */
  keptItemIndexes: number[] | null
  results: LocalTaskProposalItemResult[] | null
  createdAt: number
  decidedAt: number | null
  decidedSource: LocalTaskEventSource | null
}

/** A task the dispatcher follows: added when its proposal ran, or when it was asked to. */
export type LocalTaskWatch = {
  taskId: string
  addedAt: number
  addedBy: 'proposal' | 'dispatcher'
}

export type LocalTaskInboxKind =
  | 'progress'
  | 'status'
  | 'session'
  | 'comment'
  | 'needs-you'
  | 'proposal'
  /** A host whose library holds followed tasks left or came back into contact. */
  | 'host'

/** A fact a desktop window read in another Orca's library and passed to the dispatcher. */
export type LocalTaskForwardedFact = {
  /** Unique per fact: the library and its event, or the host and the moment contact changed. */
  sourceId: string
  /** Settled proposals are this library's own and never forwarded. */
  kind: Exclude<LocalTaskInboxKind, 'proposal'>
  at: number
  /** The task as this desktop keys it, `runtime:{env}/{id}`; null for a host fact. */
  taskId: string | null
  taskRef: string | null
  summary: string
  needsYou?: string
  /** The task moved into a completed or canceled status: once reported, it stops being followed. */
  finished?: boolean
}

/** One fact on a watched task, already worded as one line for the dispatcher (REQ-031). */
export type LocalTaskInboxItem = {
  kind: LocalTaskInboxKind
  at: number
  taskId: string | null
  taskRef: string | null
  summary: string
  needsYou?: string
}

export type LocalTaskInbox = {
  conversationId: string
  items: LocalTaskInboxItem[]
  /** Pass back to `dispatcher.ack` once the items were handled. */
  cursor: string
  /** More items wait behind `limit`. */
  more: boolean
  watchedTaskCount: number
}
