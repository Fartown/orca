import { z } from 'zod'
import type {
  LocalTaskAttentionItem,
  LocalTaskAttentionKind,
  LocalTaskLinkOrigin,
  LocalTaskLinks,
  LocalTaskProgressSnapshot,
  LocalTaskSessionLink,
  LocalTaskSessionProgress,
  LocalTaskSessionState,
  LocalTaskSessionSurface,
  LocalTaskWorkspaceKind,
  LocalTaskWorkspaceLink
} from './local-task-link-types'
import { hostUnionArms, openEnum, salvagingArray } from '../zod-salvage'

// Client-side reads of the `localTasks.links.*` and `attention.*` replies. Like local-task-read-schemas.ts, a row
// this build cannot read drops from its list; an unknown state degrades instead of failing.

const WORKSPACE_KIND_ARMS = hostUnionArms<LocalTaskWorkspaceKind>({
  'git-worktree': true,
  folder: true
})
const ORIGIN_ARMS = hostUnionArms<LocalTaskLinkOrigin>({ start: true, manual: true })
const SURFACE_ARMS = hostUnionArms<LocalTaskSessionSurface>({ terminal: true, chat: true })
const SESSION_STATE_ARMS = hostUnionArms<LocalTaskSessionState>({
  working: true,
  waiting: true,
  blocked: true,
  done: true,
  idle: true,
  exited: true,
  missing: true,
  unknown: true,
  unverifiable: true
})
const ATTENTION_KIND_ARMS = hostUnionArms<LocalTaskAttentionKind>({
  approval: true,
  question: true,
  blocked: true,
  'unread-done': true
})
export const localTaskWorkspaceLinkSchema: z.ZodType<LocalTaskWorkspaceLink, unknown> = z.object({
  taskId: z.string(),
  hostId: z.string(),
  // Why strict: a workspace kind this build lacks cannot be opened, so the row drops.
  kind: z.enum(WORKSPACE_KIND_ARMS),
  instanceId: z.string().nullable(),
  worktreeId: z.string().nullable(),
  folderWorkspaceId: z.string().nullable(),
  repoId: z.string().nullable(),
  branchSnapshot: z.string().nullable(),
  nameSnapshot: z.string().nullable(),
  hostLabelSnapshot: z.string().nullable(),
  linkedVia: openEnum(ORIGIN_ARMS, 'manual'),
  linkedAt: z.number()
})

export const localTaskSessionLinkSchema: z.ZodType<LocalTaskSessionLink, unknown> = z.object({
  id: z.string(),
  taskId: z.string(),
  hostId: z.string(),
  worktreeId: z.string().nullable(),
  instanceId: z.string().nullable(),
  surface: openEnum(SURFACE_ARMS, 'terminal'),
  tabId: z.string().nullable(),
  paneKey: z.string().nullable(),
  sessionId: z.string().nullable(),
  providerSession: z.string().nullable(),
  agent: z.string().nullable(),
  linkedVia: openEnum(ORIGIN_ARMS, 'manual'),
  openedAt: z.number()
})

export const localTaskLinksReplySchema: z.ZodType<LocalTaskLinks, unknown> = z.object({
  workspaces: salvagingArray(localTaskWorkspaceLinkSchema),
  sessions: salvagingArray(localTaskSessionLinkSchema)
})

const sessionProgressSchema: z.ZodType<LocalTaskSessionProgress, unknown> = z.object({
  taskSessionId: z.string(),
  // Why `unknown`: a state this build cannot name is shown as unknown, never as a verdict.
  state: openEnum(SESSION_STATE_ARMS, 'unknown'),
  lastMessage: z.string().nullable(),
  stateSince: z.number().nullable(),
  unread: z.boolean()
})

const attentionItemSchema: z.ZodType<LocalTaskAttentionItem, unknown> = z.object({
  key: z.string(),
  taskId: z.string(),
  taskSessionId: z.string(),
  // Why strict: an attention kind this build lacks has no actions to offer, so it drops.
  kind: z.enum(ATTENTION_KIND_ARMS),
  agent: z.string().nullable(),
  lastMessage: z.string().nullable(),
  since: z.number(),
  replyable: z.boolean()
})

export const localTaskProgressSnapshotSchema: z.ZodType<LocalTaskProgressSnapshot, unknown> =
  z.object({
    observedAt: z.number(),
    sessions: salvagingArray(sessionProgressSchema),
    items: salvagingArray(attentionItemSchema)
  })
