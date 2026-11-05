import { useAppStore } from '@/store'
import type { LocalTaskProposalItem } from '../../../shared/local-tasks/local-task-dispatcher-rpc-params'
import type { LocalTaskProposalItemResult } from '../../../shared/local-tasks/local-task-dispatcher-types'
import { isExactLocalTaskRef } from '../../../shared/local-tasks/local-task-grouping'
import type { LocalTaskSessionLink } from '../../../shared/local-tasks/local-task-link-types'
import type { LocalTask } from '../../../shared/local-tasks/local-task-types'
import { parsePaneKey } from '../../../shared/stable-pane-id'
import { isLocalTaskHostInContact } from './local-task-host-contact'
import { sendLocalTaskReply } from './local-task-needs-you-actions'
import { isProposalMiss, type LocalTaskProposalMiss } from './local-task-proposal-targets'
import { localTasksDomainStore } from './local-tasks-domain-store'

// Items that act on a task's existing session: tell it one more thing, or stop it.

export type Outcome = Omit<LocalTaskProposalItemResult, 'index'>
type Item<K extends LocalTaskProposalItem['kind']> = Extract<LocalTaskProposalItem, { kind: K }>

export function failed(miss: LocalTaskProposalMiss, taskId?: string): Outcome {
  return { ok: false, ...(taskId ? { taskId } : {}), detail: miss.miss }
}

/**
 * A task an item names by id or by ref, in any library this window reads: the dispatcher's CLI
 * sees only its own library, so a task on another host arrives as its ref (D-008).
 */
export function findProposalTask(idOrRef: string): LocalTask | LocalTaskProposalMiss {
  const { tasks, projects } = localTasksDomainStore.getState()
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

/** A session of the task, on a host this window is in contact with; its only one when unnamed. */
function liveSession(item: {
  taskId: string
  sessionLinkId?: string
}): { task: LocalTask; link: LocalTaskSessionLink } | LocalTaskProposalMiss {
  const task = findProposalTask(item.taskId)
  if (isProposalMiss(task)) {
    return task
  }
  const sessions = localTasksDomainStore
    .getState()
    .links.sessions.filter((candidate) => candidate.taskId === task.id)
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
  return isLocalTaskHostInContact(useAppStore.getState(), named[0].hostId)
    ? { task, link: named[0] }
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
  state.closeTab(link.tabId, { captureRecentlyClosed: true })
  return { ok: true, taskId: task.id, detail: 'stopped' }
}
