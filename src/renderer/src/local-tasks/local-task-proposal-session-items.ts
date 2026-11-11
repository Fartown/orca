import { useAppStore } from '@/store'
import type { LocalTaskProposalItem } from '../../../shared/local-tasks/local-task-dispatcher-rpc-params'
import type { LocalTaskProposalItemResult } from '../../../shared/local-tasks/local-task-dispatcher-types'
import { isExactLocalTaskRef } from '../../../shared/local-tasks/local-task-grouping'
import type { LocalTaskSessionLink } from '../../../shared/local-tasks/local-task-link-types'
import type { LocalTask } from '../../../shared/local-tasks/local-task-types'
import { parsePaneKey } from '../../../shared/stable-pane-id'
import { findActiveRuntimeTerminal } from '@/lib/active-agent-note-target'
import { isLocalTaskHostInContact } from './local-task-host-contact'
import { localTaskEndpointForHost, localTaskEndpointTarget } from './local-task-endpoints'
import { stopLocalTaskTerminalOnHost } from './local-task-terminal-stop'
import { sendLocalTaskReply } from './local-task-needs-you-actions'
import { isProposalMiss, type LocalTaskProposalMiss } from './local-task-proposal-targets'
import { localTasksDomainStore, type LocalTasksDomainState } from './local-tasks-domain-store'

// Items that act on a task's existing session: tell it one more thing, or stop it.

export type Outcome = Omit<LocalTaskProposalItemResult, 'index'>
/** The rows a proposal item is resolved against: the window's merged libraries. */
export type ProposalDomain = Pick<LocalTasksDomainState, 'tasks' | 'projects' | 'links'>
type Item<K extends LocalTaskProposalItem['kind']> = Extract<LocalTaskProposalItem, { kind: K }>

export function failed(miss: LocalTaskProposalMiss, taskId?: string): Outcome {
  return { ok: false, ...(taskId ? { taskId } : {}), detail: miss.miss }
}

/**
 * A task an item names by id or by ref, in any library this window reads: the dispatcher's CLI
 * sees only its own library, so a task on another host arrives as its ref (D-008).
 */
export function findProposalTask(
  idOrRef: string,
  domain: ProposalDomain = localTasksDomainStore.getState()
): LocalTask | LocalTaskProposalMiss {
  const { tasks, projects } = domain
  const byId = tasks.find((task) => task.id === idOrRef)
  if (byId) {
    return byId
  }
  const byRef = tasks.filter((task) =>
    isExactLocalTaskRef(
      task,
      projects.find((project) => project.id === task.projectId),
      idOrRef
    )
  )
  if (byRef.length === 1) {
    return byRef[0]
  }
  return {
    miss:
      byRef.length === 0
        ? `no task ${idOrRef} in a library this window can read (its host may be out of contact)`
        : `${idOrRef} names tasks on ${byRef.length} hosts`
  }
}

/** A session of the task the item names; its only one when unnamed. */
export function findProposalSession(
  item: { taskId: string; sessionLinkId?: string },
  domain: ProposalDomain = localTasksDomainStore.getState()
): { task: LocalTask; link: LocalTaskSessionLink } | LocalTaskProposalMiss {
  const task = findProposalTask(item.taskId, domain)
  if (isProposalMiss(task)) {
    return task
  }
  const sessions = domain.links.sessions.filter((candidate) => candidate.taskId === task.id)
  const named = item.sessionLinkId
    ? sessions.filter((candidate) => candidate.id === item.sessionLinkId)
    : sessions
  if (named.length !== 1) {
    return {
      miss: item.sessionLinkId
        ? 'the session is not linked to that task'
        : `${task.ref} has ${named.length} sessions; name one with sessionLinkId`
    }
  }
  return { task, link: named[0] }
}

/** The item's session, on a host this window is in contact with. */
function liveSession(item: {
  taskId: string
  sessionLinkId?: string
}): { task: LocalTask; link: LocalTaskSessionLink } | LocalTaskProposalMiss {
  const found = findProposalSession(item)
  if (isProposalMiss(found)) {
    return found
  }
  return isLocalTaskHostInContact(useAppStore.getState(), found.link.hostId)
    ? found
    : { miss: 'the session’s host is out of contact (unverifiable)' }
}

export async function runAppendItem(item: Item<'append'>): Promise<Outcome> {
  const found = liveSession(item)
  if (isProposalMiss(found)) {
    return failed(found)
  }
  const sent = await sendLocalTaskReply(found.link, item.text)
  return sent.status === 'sent'
    ? { ok: true, taskId: found.task.id, detail: 'sent' }
    : failed({ miss: `not sent (${sent.status})` }, found.task.id)
}

export async function runStopItem(item: Item<'stop'>): Promise<Outcome> {
  const found = liveSession(item)
  if (isProposalMiss(found)) {
    return failed(found)
  }
  const { task, link } = found
  const state = useAppStore.getState()
  const layout = link.tabId ? state.terminalLayoutsByTabId[link.tabId] : undefined
  if (link.surface !== 'terminal' || !link.tabId || !layout) {
    return failed({ miss: 'only an open terminal session can be stopped here' }, task.id)
  }
  // Why one pane only: closing a split tab would also end sessions the proposal never named.
  if (layout.root?.type !== 'leaf') {
    return failed({ miss: 'the session shares its tab; stop it there' }, task.id)
  }
  // Why the leaf: a tab reused after the agent left, or a moved pane, holds another process; the
  // pane key is the owning host's, whose tab id a paired client spells its own way.
  const leafId = link.paneKey ? parsePaneKey(link.paneKey)?.leafId : undefined
  if (!leafId || leafId !== layout.root.leafId) {
    return failed({ miss: 'its tab no longer holds this session' }, task.id)
  }
  const endpoint = localTaskEndpointForHost(link.hostId)
  if (
    !endpoint ||
    !link.worktreeId ||
    !isLocalTaskHostInContact(useAppStore.getState(), link.hostId)
  ) {
    return failed({ miss: 'the session’s host is out of contact (unverifiable)' }, task.id)
  }
  let terminal: Awaited<ReturnType<typeof findActiveRuntimeTerminal>>
  try {
    terminal = await findActiveRuntimeTerminal(
      localTaskEndpointTarget(endpoint),
      link.worktreeId,
      { tabId: link.tabId, leafId },
      3000
    )
  } catch {
    return failed({ miss: 'the session could not be confirmed (unverifiable)' }, task.id)
  }
  if (!terminal || !(await stopLocalTaskTerminalOnHost(link.hostId, terminal.handle))) {
    return failed({ miss: 'the session stop could not be confirmed (unverifiable)' }, task.id)
  }
  state.closeTab(link.tabId, { captureRecentlyClosed: true, remoteCloseOwnedByHost: true })
  return { ok: true, taskId: task.id, detail: 'stopped' }
}
