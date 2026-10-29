import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { sendMessageToAgent, type AgentMessageTarget } from '@/lib/agent-message-send'
import type { ActiveAgentNotesSendResult } from '@/lib/active-agent-note-send-result'
import { parsePaneKey } from '../../../shared/stable-pane-id'
import type {
  LocalTaskAttentionItem,
  LocalTaskSessionLink
} from '../../../shared/local-tasks/local-task-link-types'
import type { LocalTaskPageKeyAction } from './local-task-page-keys'
import { buildLocalTaskIndex } from './local-task-grouping'
import { buildLocalTaskNeedsYouRows, type LocalTaskNeedsYouRow } from './local-task-needs-you-rows'
import { localTaskNeedsYouStore } from './local-task-needs-you-store'
import { localTaskPageStore } from './local-task-page-store'
import { openLocalTaskSession } from './local-task-session-reveal'
import { runLocalTaskWrite } from './local-task-writes'
import { localTasksClient } from './local-tasks-runtime-client'
import {
  isLocalTaskRowWritable,
  localTasksDomainStore,
  type LocalTasksDomainState
} from './local-tasks-domain-store'

/** The rows the view shows right now, for the page's single keys. */
export function currentLocalTaskNeedsYouRows(): LocalTaskNeedsYouRow[] {
  const domain = localTasksDomainStore.getState()
  return buildLocalTaskNeedsYouRows({
    progress: domain.progress,
    drafts: localTaskNeedsYouStore.getState().drafts,
    tasksById: buildLocalTaskIndex(domain.projects, domain.tasks).tasksById,
    scopeProjectId: localTaskPageStore.getState().scopeProjectId
  })
}

/** Items the host still lists; entries kept for a reply box are not acknowledgeable facts. */
function liveEntriesOf(row: LocalTaskNeedsYouRow): LocalTaskAttentionItem[] {
  return row.entries.filter((entry) => entry.standing === 'listed').map((entry) => entry.item)
}

/** Live items whose library takes writes now; the row's buttons and the E and H keys act on these. */
export function writableEntriesOf(
  row: LocalTaskNeedsYouRow,
  domain: Pick<LocalTasksDomainState, 'partitions' | 'home'> = localTasksDomainStore.getState()
): LocalTaskAttentionItem[] {
  return liveEntriesOf(row).filter((item) => isLocalTaskRowWritable(domain, item.taskSessionId))
}

export function openLocalTaskItemSession(item: LocalTaskAttentionItem): void {
  const link = localTasksDomainStore
    .getState()
    .links.sessions.find((candidate) => candidate.id === item.taskSessionId)
  if (!link || !openLocalTaskSession(link)) {
    toast.error(
      translate('localTasks.needsYou.openFailed', 'This session could not be opened from here.')
    )
  }
}

/** Takes items out of the list without changing any fact; the next wait brings them back. */
export async function acknowledgeLocalTaskItems(
  items: readonly LocalTaskAttentionItem[]
): Promise<void> {
  for (const item of items) {
    await runLocalTaskWrite(() =>
      localTasksClient.acknowledgeAttention(item.key, item.taskSessionId)
    )
  }
}

export async function snoozeLocalTaskItems(
  items: readonly LocalTaskAttentionItem[],
  until: number
): Promise<void> {
  for (const item of items) {
    await runLocalTaskWrite(() =>
      localTasksClient.snoozeAttention({
        itemKey: item.key,
        taskSessionId: item.taskSessionId,
        until
      })
    )
  }
}

/** Where the session takes a message, in this client's own tab and pane ids. */
export function localTaskReplyTarget(
  link: Pick<LocalTaskSessionLink, 'surface' | 'sessionId' | 'paneKey'>
): AgentMessageTarget | null {
  if (link.surface === 'chat') {
    return link.sessionId ? { kind: 'structured-session', sessionId: link.sessionId } : null
  }
  const pane = link.paneKey ? parsePaneKey(link.paneKey) : null
  return pane ? { kind: 'terminal', tabId: pane.tabId, leafId: pane.leafId } : null
}

/**
 * Sends a reply straight to the session the way Orca sends any message to an agent: once, with
 * no queue and no resend. Anything but `sent` leaves the text with the caller.
 */
export async function sendLocalTaskReply(
  link: LocalTaskSessionLink,
  text: string
): Promise<ActiveAgentNotesSendResult> {
  const target = localTaskReplyTarget(link)
  if (!link.worktreeId || !target) {
    return { status: 'no-active-terminal', code: 'no-note-target' }
  }
  try {
    return await sendMessageToAgent({ worktreeId: link.worktreeId, target, prompt: text })
  } catch {
    return { status: 'status-unavailable', code: 'runtime-unverifiable' }
  }
}

// Why swallowed: they act on the list and board, which the Needs you view hides.
const LIST_ONLY_KEYS: ReadonlySet<LocalTaskPageKeyAction> = new Set([
  'preview',
  'select',
  'toggle-layout',
  'filter'
])

/**
 * Single keys while the Needs you view is shown; the cursor is a task row. Returns false to let
 * the page handle the key as usual (moving, creating, searching, status pickers).
 */
export function runLocalTaskNeedsYouKey(
  action: LocalTaskPageKeyAction,
  cursorTaskId: string | null
): boolean {
  const row = cursorTaskId
    ? currentLocalTaskNeedsYouRows().find((candidate) => candidate.task.id === cursorTaskId)
    : undefined
  if (action === 'open') {
    const first = row?.entries[0]
    if (first) {
      openLocalTaskItemSession(first.item)
    }
    return true
  }
  if (action === 'acknowledge') {
    if (row) {
      void acknowledgeLocalTaskItems(writableEntriesOf(row))
    }
    return true
  }
  if (action === 'snooze') {
    if (row && writableEntriesOf(row).length > 0) {
      localTaskNeedsYouStore.getState().setSnoozeTaskId(row.task.id)
    }
    return true
  }
  if (action === 'search') {
    localTaskPageStore.getState().setView('all')
    return false
  }
  return LIST_ONLY_KEYS.has(action)
}
