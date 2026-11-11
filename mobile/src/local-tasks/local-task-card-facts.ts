import type { LocalTaskIndex } from '../../../src/shared/local-tasks/local-task-grouping'
import type {
  LocalTaskAttentionItem,
  LocalTaskLinks,
  LocalTaskProgressSnapshot,
  LocalTaskSessionLink,
  LocalTaskSessionState
} from '../../../src/shared/local-tasks/local-task-link-types'
import { localTaskDescendantIds } from '../../../src/shared/local-tasks/local-task-tree'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import { localTaskLatestProgress } from './local-task-latest-line'
import {
  localTaskRowSessionStates,
  localTaskWorkspaceLinkFor
} from './local-task-progress-projection'

export type LocalTaskCardSession = {
  link: LocalTaskSessionLink
  state: LocalTaskSessionState
  /** What this session waits on the user for, when it does. */
  item: LocalTaskAttentionItem | null
  lastMessage: string | null
  stateSince: number | null
}

export type LocalTaskCardLatest = {
  /** One line: a writeback, the agent's last words, or a session that has not written yet. */
  source: 'writeback' | 'last-line' | 'started'
  body: string
  at: number | null
  /** The subtask that wrote it, when not the task itself. */
  fromRef: string | null
}

export type LocalTaskCardSubtasks = {
  count: number
  summary:
    | { kind: 'none' }
    | { kind: 'all-done' }
    | { kind: 'waiting'; count: number }
    | { kind: 'working'; count: number }
    | null
  latest: { ref: string; body: string } | null
}

export type LocalTaskCardFacts = {
  /** Where the task works: its own workspace or the nearest ancestor's. */
  workspace: { name: string; hostId: string } | null
  hostName: string
  /**
   * The workspace's host is out of contact: the library's own host, the paired host's word on an
   * SSH host, or every session reading `unverifiable`. Only what was last read shows then.
   */
  offline: boolean
  lead: LocalTaskCardSession | null
  sessionCount: number
  latest: LocalTaskCardLatest | null
  subtasks: LocalTaskCardSubtasks | null
}

const LEAD_ORDER: readonly LocalTaskSessionState[] = [
  'waiting',
  'blocked',
  'working',
  'done',
  'idle',
  'unverifiable'
]

/** The session a card names first, as the desktop picks it: what waits, then work, then newest. */
function pickLead(sessions: readonly LocalTaskCardSession[]): LocalTaskCardSession | null {
  const waiting = sessions.findLast(
    (session) => session.item && session.item.kind !== 'unread-done'
  )
  if (waiting) {
    return waiting
  }
  for (const wanted of LEAD_ORDER) {
    const found = sessions.findLast((session) => session.state === wanted)
    if (found) {
      return found
    }
  }
  return sessions.at(-1) ?? null
}

/** A linked session as the drawer's head names it: whose it is, how it stands, and where it runs. */
export type LocalTaskSessionSummary = {
  link: LocalTaskSessionLink
  task: LocalTask | null
  state: LocalTaskSessionState
  item: LocalTaskAttentionItem | null
  stateSince: number | null
  workspaceName: string
  hostName: string
}

export function localTaskSessionSummary(args: {
  taskSessionId: string
  index: Pick<LocalTaskIndex, 'tasksById'>
  links: LocalTaskLinks
  snapshot: LocalTaskProgressSnapshot | null
  inContact: boolean
  hostName: (ownerHostId: string, snapshotLabel: string | null) => string
}): LocalTaskSessionSummary | null {
  const link = args.links.sessions.find((entry) => entry.id === args.taskSessionId)
  if (!link) {
    return null
  }
  const task = args.index.tasksById.get(link.taskId) ?? null
  const workspace = task ? localTaskWorkspaceLinkFor(task, args.index.tasksById, args.links) : null
  const entry = args.snapshot?.sessions.find((session) => session.taskSessionId === link.id)
  return {
    link,
    task,
    state: args.inContact ? (entry?.state ?? 'unknown') : 'unverifiable',
    item: args.inContact
      ? (args.snapshot?.items.find((item) => item.taskSessionId === link.id) ?? null)
      : null,
    stateSince: entry?.stateSince ?? null,
    workspaceName: workspace?.nameSnapshot ?? workspace?.branchSnapshot ?? '',
    hostName: args.hostName(link.hostId, workspace?.hostLabelSnapshot ?? null)
  }
}

function oneLine(text: string): string {
  return text.replace(/\s*\n+\s*/g, ' ').trim()
}

function subtaskFacts(
  task: LocalTask,
  index: Pick<LocalTaskIndex, 'childrenByParentId'>,
  links: LocalTaskLinks,
  states: ReadonlyMap<string, LocalTaskSessionState>,
  inContact: boolean
): LocalTaskCardSubtasks | null {
  const children = index.childrenByParentId.get(task.id) ?? []
  if (children.length === 0) {
    return null
  }
  const childIds = new Set(children.map((child) => child.id))
  const sessionStates = links.sessions
    .filter((link) => childIds.has(link.taskId))
    .map((link) => (inContact ? (states.get(link.id) ?? 'unknown') : 'unverifiable'))
  const waiting = sessionStates.filter((state) => state === 'waiting').length
  const working = sessionStates.filter((state) => state === 'working').length
  const summary: LocalTaskCardSubtasks['summary'] =
    sessionStates.length === 0
      ? { kind: 'none' }
      : sessionStates.every((state) => state === 'done')
        ? { kind: 'all-done' }
        : waiting > 0
          ? { kind: 'waiting', count: waiting }
          : working > 0
            ? { kind: 'working', count: working }
            : null
  const latest = children
    .filter((child) => child.latestProgress?.body)
    .sort((a, b) => (b.latestProgress?.at ?? 0) - (a.latestProgress?.at ?? 0))[0]
  return {
    count: children.length,
    summary,
    latest: latest?.latestProgress
      ? { ref: latest.ref, body: oneLine(latest.latestProgress.body) }
      : null
  }
}

/**
 * What a task card says, read only from what the page already loaded: no host is asked anything
 * here, and out of contact every session reads `unverifiable` and keeps its last words.
 */
export function localTaskCardFacts(args: {
  task: LocalTask
  index: Pick<LocalTaskIndex, 'tasksById' | 'childrenByParentId'>
  links: LocalTaskLinks
  snapshot: LocalTaskProgressSnapshot | null
  /** The library's own host is in contact. */
  inContact: boolean
  hostName: (ownerHostId: string, snapshotLabel: string | null) => string
  /** The paired host's word on a host; null when it gave none. */
  hostConnected: (ownerHostId: string) => boolean | null
}): LocalTaskCardFacts {
  const { task, index, links, snapshot, inContact } = args
  const link = localTaskWorkspaceLinkFor(task, index.tasksById, links)
  const progress = new Map((snapshot?.sessions ?? []).map((entry) => [entry.taskSessionId, entry]))
  const states = new Map([...progress].map(([id, entry]) => [id, entry.state]))
  const items = snapshot?.items ?? []
  const sessions: LocalTaskCardSession[] = localTaskRowSessionStates({
    task,
    index,
    links,
    snapshot,
    inContact
  }).flatMap((row) => {
    const sessionLink = links.sessions.find((entry) => entry.id === row.id)
    if (!sessionLink) {
      return []
    }
    const entry = progress.get(row.id)
    return [
      {
        link: sessionLink,
        state: row.state,
        item: inContact ? (items.find((item) => item.taskSessionId === row.id) ?? null) : null,
        lastMessage: entry?.lastMessage ?? null,
        stateSince: entry?.stateSince ?? null
      }
    ]
  })
  const lead = pickLead(sessions)
  const offline =
    !inContact ||
    (link !== null && args.hostConnected(link.hostId) === false) ||
    (sessions.length > 0 && sessions.every((session) => session.state === 'unverifiable'))
  const descendants = localTaskDescendantIds(task.id, index.childrenByParentId).flatMap((id) => {
    const child = index.tasksById.get(id)
    return child ? [child] : []
  })
  const written = localTaskLatestProgress(task, descendants)
  const writer = written ? (index.tasksById.get(written.taskId) ?? task) : null
  const latest: LocalTaskCardLatest | null = written
    ? {
        source: writer?.latestProgress?.kind === 'turn-ended' ? 'last-line' : 'writeback',
        body: oneLine(written.body),
        at: written.at,
        fromRef:
          written.taskId === task.id ? null : (index.tasksById.get(written.taskId)?.ref ?? null)
      }
    : lead?.lastMessage
      ? { source: 'last-line', body: oneLine(lead.lastMessage), at: lead.stateSince, fromRef: null }
      : lead
        ? { source: 'started', body: '', at: null, fromRef: null }
        : null
  return {
    workspace: link
      ? {
          name: link.nameSnapshot ?? link.branchSnapshot ?? link.worktreeId ?? '',
          hostId: link.hostId
        }
      : null,
    hostName: link ? args.hostName(link.hostId, link.hostLabelSnapshot) : '',
    offline,
    lead,
    sessionCount: sessions.length,
    latest,
    subtasks: subtaskFacts(task, index, links, states, inContact)
  }
}
