/**
 * The "needs you" rules (REQ-014) over one agent status row. Pure, so the library's host judges
 * with them and any client reading a row the same way reaches the same verdict.
 */
import type { AgentStatusIpcPayload } from '../agent-status-types'
import {
  AGENT_STATUS_STALE_AFTER_MS,
  agentStatusAuthorityObservedAt
} from '../agent-status-freshness'
import { resolveDecayedAgentRowState } from '../agent-row-decay-state'
import { parseAskFromStatus } from '../native-chat-ask'
import type {
  LocalTaskAttentionItem,
  LocalTaskAttentionKind,
  LocalTaskSessionLink,
  LocalTaskSessionState
} from './local-task-link-types'

const AGENT_LABEL_MAX = 64
const LAST_MESSAGE_MAX = 500

/** The fields of a host status row the rules read. */
export type LocalTaskStatusRow = Pick<
  AgentStatusIpcPayload,
  | 'paneKey'
  | 'state'
  | 'stateStartedAt'
  | 'receivedAt'
  | 'evidenceObservedAt'
  | 'interactivePrompt'
  | 'toolName'
  | 'agentType'
  | 'programStatus'
  | 'restoredUnconfirmed'
  | 'sessionBoundary'
  | 'structuredHost'
  | 'lastAssistantMessage'
  | 'lastAssistantMessageIsToolOutput'
>

/** `paneKey@stateStartedAt`: the next wait of the same session is a new item (REQ-014). */
export function localTaskAttentionKey(paneKey: string, stateStartedAt: number): string {
  return `${paneKey}@${stateStartedAt}`
}

/** Whether `key` names some wait of this pane, current or past. */
export function isLocalTaskAttentionKeyOfPane(key: string, paneKey: string): boolean {
  const startedAt = key.startsWith(`${paneKey}@`) ? key.slice(paneKey.length + 1) : ''
  return startedAt !== '' && Number.isFinite(Number(startedAt))
}

function hasApprovalEnvelope(interactivePrompt: string | undefined): boolean {
  if (!interactivePrompt) {
    return false
  }
  try {
    const parsed: unknown = JSON.parse(interactivePrompt)
    if (!parsed || typeof parsed !== 'object' || !('approval' in parsed)) {
      return false
    }
    const approval = parsed.approval
    return (
      !!approval &&
      typeof approval === 'object' &&
      'tool' in approval &&
      typeof approval.tool === 'string' &&
      approval.tool.length > 0
    )
  } catch {
    return false
  }
}

export function localTaskWaitingKind(row: LocalTaskStatusRow): 'approval' | 'question' {
  if (parseAskFromStatus(row.interactivePrompt, row.toolName)) {
    return 'question'
  }
  if (hasApprovalEnvelope(row.interactivePrompt)) {
    return 'approval'
  }
  if (row.toolName === 'AskUserQuestion') {
    return 'question'
  }
  // Hookless programs report through OSC 7501; with no reason at all the user is asked to answer.
  return row.programStatus?.kind === 'permission' ? 'approval' : 'question'
}

/**
 * The state a row shows, with upstream's decay: a non-`done` row silent past the stale window
 * (or replayed from disk) reads `unverifiable` while its terminal runs, else `idle`.
 */
export function localTaskRowState(
  row: LocalTaskStatusRow,
  terminalLive: boolean,
  now: number
): LocalTaskSessionState {
  if (row.state === 'done') {
    return 'done'
  }
  const fresh =
    row.restoredUnconfirmed !== true &&
    (row.structuredHost === 'owned' ||
      now - localTaskRowObservedAt(row) <= AGENT_STATUS_STALE_AFTER_MS)
  return fresh ? row.state : resolveDecayedAgentRowState(row, terminalLive)
}

/** When a non-`done` row stops counting as fresh; null when it never decays by time. */
export function localTaskRowStaleAt(row: LocalTaskStatusRow): number | null {
  if (row.state === 'done' || row.restoredUnconfirmed === true || row.structuredHost === 'owned') {
    return null
  }
  return localTaskRowObservedAt(row) + AGENT_STATUS_STALE_AFTER_MS + 1
}

function localTaskRowObservedAt(row: LocalTaskStatusRow): number {
  return agentStatusAuthorityObservedAt({
    updatedAt: row.receivedAt,
    evidenceObservedAt: row.evidenceObservedAt
  })
}

/** What the agent last said: prose before a tool's output, else the last prose remembered. */
export function localTaskRowWords(
  row: LocalTaskStatusRow | null,
  rememberedProse: string | null
): string | null {
  const current =
    row && !row.lastAssistantMessageIsToolOutput ? row.lastAssistantMessage : undefined
  const text = (current || rememberedProse || '').trim()
  return text ? text.slice(0, LAST_MESSAGE_MAX) : null
}

export type LocalTaskAttentionEvidence = {
  state: LocalTaskSessionState
  /** The live row behind `state`; null when nothing live reports for the session. */
  row: LocalTaskStatusRow | null
  /** Structured chats report every "needs you" as `blocked`, without saying why. */
  structured: boolean
  /** A finished turn nobody marked seen. */
  unread: boolean
}

/** The four "needs you" kinds; null means "does not need you". */
export function classifyLocalTaskAttention(
  evidence: LocalTaskAttentionEvidence
): LocalTaskAttentionKind | null {
  const { state, row } = evidence
  // Why restoredUnconfirmed: a status replayed from disk is not news until a live event confirms it.
  if (!row || row.restoredUnconfirmed) {
    return null
  }
  switch (state) {
    case 'waiting':
      return localTaskWaitingKind(row)
    case 'blocked':
      return evidence.structured ? 'question' : 'blocked'
    case 'done':
      // A session boundary (start, resume, clear) finished no turn.
      return evidence.unread && row.sessionBoundary !== true ? 'unread-done' : null
    case 'working':
    case 'idle':
    case 'exited':
    case 'missing':
    case 'unknown':
    case 'unverifiable':
      return null
  }
}

/**
 * Whether looking at the session clears the item (REQ-014): only a finished turn is done once
 * read. An approval, a question or a block still waits after a glance, until the agent moves on
 * or the user marks it seen on purpose (REQ-015).
 */
export function localTaskAttentionClearsOnView(
  item: Pick<LocalTaskAttentionItem, 'kind'>
): boolean {
  return item.kind === 'unread-done'
}

export function localTaskAttentionItem(
  link: Pick<LocalTaskSessionLink, 'id' | 'taskId' | 'agent'>,
  evidence: LocalTaskAttentionEvidence & { lastMessage: string | null }
): LocalTaskAttentionItem | null {
  const kind = classifyLocalTaskAttention(evidence)
  const { row } = evidence
  if (!kind || !row) {
    return null
  }
  const agent = link.agent ?? row.agentType ?? null
  return {
    key: localTaskAttentionKey(row.paneKey, row.stateStartedAt),
    taskId: link.taskId,
    taskSessionId: link.id,
    kind,
    agent: agent && agent !== 'unknown' ? agent.slice(0, AGENT_LABEL_MAX) : null,
    lastMessage: evidence.lastMessage,
    since: row.stateStartedAt,
    // Why: only a finished turn takes typed input; every wait is answered inside the session.
    replyable: kind === 'unread-done'
  }
}
