import { useAppStore } from '@/store'
import { selectExecutionHostDisplayLabel } from '@/lib/execution-host-display-label'
import type {
  LocalTaskForwardedFact,
  LocalTaskWatch
} from '../../../shared/local-tasks/local-task-dispatcher-types'
import {
  describeLocalTaskInboxEvent,
  inboxLine,
  isOtherLibraryTaskId,
  pendingWatchRef,
  quotedTaskTitle
} from '../../../shared/local-tasks/local-task-inbox-copy'
import { LOCAL_TASK_FORWARDED_FACT_TEXT_MAX } from '../../../shared/local-tasks/local-task-model'
import { localTaskDispatcherClient } from './local-task-dispatcher-client'
import { isProposalMiss } from './local-task-proposal-targets'
import { findProposalTask, type ProposalDomain } from './local-task-proposal-session-items'
import { knownDispatcherPaneKey } from './local-task-dispatcher-session'
import { localTaskIdEndpoint, type LocalTaskEndpointKey } from './local-task-endpoints'
import { subscribeSelfLocalTaskChanges } from './local-task-self-changes'
import { localTasksDomainStore } from './local-tasks-domain-store'
import type {
  LocalTask,
  LocalTaskEvent,
  LocalTaskStatusDef
} from '../../../shared/local-tasks/local-task-types'
import { localTasksSync } from './local-tasks-sync'

// Why a grace: a proposal's own run (status, first session) happens just before its watch lands.
const EVENT_GRACE_MS = 10 * 60_000
const FACTS_PER_CALL = 100

/** What forwarding reads of the domain: the synced libraries' tasks, events and contact. */
export type ForwardingView = {
  tasks: readonly Pick<LocalTask, 'id' | 'ref' | 'title' | 'projectId'>[]
  projects: readonly {
    id: string
    statuses: readonly Pick<LocalTaskStatusDef, 'id' | 'category'>[]
  }[]
  eventsByTaskId: Readonly<Record<string, readonly LocalTaskEvent[]>>
  partitions: readonly { endpoint: string; inContact: boolean }[]
}

type ForwardingDeps = {
  client: Pick<typeof localTaskDispatcherClient, 'watches' | 'recordFacts' | 'watch'>
  watchEvents: (taskId: string) => () => void
  paneKey: () => string | null
  hostLabel: (endpoint: LocalTaskEndpointKey) => string
  now: () => number
  /** The synced libraries a pending ref is looked up in. */
  domain: () => ProposalDomain
}

const DEFAULT_DEPS: ForwardingDeps = {
  client: localTaskDispatcherClient,
  watchEvents: (taskId) => localTasksSync.watchEvents(taskId),
  paneKey: knownDispatcherPaneKey,
  hostLabel: (endpoint) => selectExecutionHostDisplayLabel(useAppStore.getState(), endpoint),
  now: Date.now,
  domain: () => localTasksDomainStore.getState()
}

/**
 * Carries what happens on tasks the dispatcher follows in other Orcas' libraries (an SSH host's,
 * a paired server's; D-008) into its inbox, and tells it when such a host leaves or regains
 * contact. It reads those libraries only through their syncs, which follow host contact; it never
 * asks a host on its own, and a host out of contact simply forwards nothing until it is back.
 */
export function createLocalTaskDispatcherForwarding(deps: ForwardingDeps = DEFAULT_DEPS): {
  refreshWatches: () => Promise<void>
  forward: (state?: ForwardingView) => Promise<void>
  resolvePending: () => Promise<void>
  dispose: () => void
} {
  let remote: LocalTaskWatch[] = []
  /** Refs the dispatcher asked to watch that its own library does not hold (REQ-031). */
  let pending: string[] = []
  let resolving = false
  const releases = new Map<string, () => void>()
  const sent = new Set<string>()
  const contact = new Map<LocalTaskEndpointKey, boolean>()
  let forwarding = false
  let again = false

  function collect(state: ForwardingView): LocalTaskForwardedFact[] {
    const facts: LocalTaskForwardedFact[] = []
    for (const watch of remote) {
      const task = state.tasks.find((candidate) => candidate.id === watch.taskId) ?? null
      const project = task
        ? state.projects.find((candidate) => candidate.id === task.projectId)
        : undefined
      for (const event of state.eventsByTaskId[watch.taskId] ?? []) {
        const sourceId = `${watch.taskId}#${event.id}`
        if (sent.has(sourceId) || event.createdAt < watch.addedAt - EVENT_GRACE_MS) {
          continue
        }
        const copy = describeLocalTaskInboxEvent(
          event,
          task,
          (statusId) => project?.statuses.find((status) => status.id === statusId)?.category ?? null
        )
        if (!copy || copy.kind === 'proposal') {
          sent.add(sourceId)
          continue
        }
        facts.push({
          sourceId,
          kind: copy.kind,
          at: event.createdAt,
          taskId: watch.taskId,
          taskRef: task?.ref ?? null,
          summary: inboxLine(copy.summary, LOCAL_TASK_FORWARDED_FACT_TEXT_MAX),
          ...(copy.needsYou
            ? { needsYou: inboxLine(copy.needsYou, LOCAL_TASK_FORWARDED_FACT_TEXT_MAX) }
            : {}),
          ...(copy.finished ? { finished: true } : {})
        })
      }
    }
    for (const endpoint of new Set(remote.map((watch) => localTaskIdEndpoint(watch.taskId)))) {
      // Why skip a library not opened yet: its contact is unknown, not lost.
      const partition = state.partitions.find((candidate) => candidate.endpoint === endpoint)
      if (!partition) {
        continue
      }
      const { inContact } = partition
      const before = contact.get(endpoint)
      contact.set(endpoint, inContact)
      if (before === undefined || before === inContact) {
        continue
      }
      const at = deps.now()
      const label = deps.hostLabel(endpoint)
      facts.push({
        sourceId: `${endpoint}#contact#${at}`,
        kind: 'host',
        at,
        taskId: null,
        taskRef: null,
        summary: inboxLine(
          inContact
            ? `${label} is back in contact; news from its tasks resumes`
            : `${label} is out of contact: its tasks can't be confirmed (unverifiable) until it is back`,
          LOCAL_TASK_FORWARDED_FACT_TEXT_MAX
        )
      })
    }
    return facts
  }

  async function forwardOnce(state: ForwardingView): Promise<void> {
    const paneKey = deps.paneKey()
    if (!paneKey || remote.length === 0) {
      return
    }
    const facts = collect(state)
    for (let at = 0; at < facts.length; at += FACTS_PER_CALL) {
      const batch = facts.slice(at, at + FACTS_PER_CALL)
      const result = await deps.client.recordFacts(paneKey, batch).catch(() => null)
      if (result?.ok) {
        for (const fact of batch) {
          sent.add(fact.sourceId)
        }
      }
    }
  }

  async function forward(state?: ForwardingView): Promise<void> {
    if (forwarding) {
      again = true
      return
    }
    forwarding = true
    try {
      do {
        again = false
        await forwardOnce(state ?? localTasksDomainStore.getState()).catch((error: unknown) => {
          console.error('local tasks: forwarding news to the dispatcher failed', error)
        })
        state = undefined
      } while (again)
    } finally {
      forwarding = false
    }
  }

  async function followPending(paneKey: string, pendingId: string): Promise<boolean> {
    const ref = pendingWatchRef(pendingId)
    const task = ref ? findProposalTask(ref, deps.domain()) : null
    if (!task || isProposalMiss(task)) {
      return false
    }
    const watched = await deps.client.watch(paneKey, task.id, pendingId).catch(() => null)
    if (!watched?.ok) {
      return false
    }
    await deps.client
      .recordFacts(paneKey, [
        {
          sourceId: `${task.id}#followed#${pendingId}`,
          kind: 'host',
          at: deps.now(),
          taskId: task.id,
          taskRef: task.ref,
          summary: inboxLine(
            `Now following ${task.ref} ${quotedTaskTitle(task.title)} on ${deps.hostLabel(localTaskIdEndpoint(task.id))}`,
            LOCAL_TASK_FORWARDED_FACT_TEXT_MAX
          )
        }
      ])
      .catch(() => null)
    return true
  }

  /**
   * Follows each pending ref in the one synced library that holds it; the same write drops the
   * ref. A ref no library in contact holds, or that several hold, waits for the next change of the
   * libraries.
   */
  async function resolvePending(): Promise<void> {
    const paneKey = deps.paneKey()
    if (!paneKey || pending.length === 0 || resolving) {
      return
    }
    resolving = true
    try {
      // Why safe to drop inside: `pending` is replaced, never changed, so this walks the old list.
      for (const pendingId of pending) {
        if (await followPending(paneKey, pendingId)) {
          pending = pending.filter((id) => id !== pendingId)
        }
      }
    } finally {
      resolving = false
    }
  }

  async function refreshWatches(): Promise<void> {
    const paneKey = deps.paneKey()
    if (!paneKey) {
      return
    }
    const result = await deps.client.watches(paneKey).catch(() => null)
    if (!result?.ok) {
      return
    }
    pending = result.watches
      .map((watch) => watch.taskId)
      .filter((taskId) => pendingWatchRef(taskId) !== null)
    remote = result.watches.filter((watch) => isOtherLibraryTaskId(watch.taskId))
    const wanted = new Set(remote.map((watch) => watch.taskId))
    for (const taskId of wanted) {
      if (!releases.has(taskId)) {
        releases.set(taskId, deps.watchEvents(taskId))
      }
    }
    for (const [taskId, release] of releases) {
      if (!wanted.has(taskId)) {
        release()
        releases.delete(taskId)
      }
    }
    await resolvePending()
    await forward()
  }

  return {
    refreshWatches,
    forward,
    resolvePending,
    dispose: () => {
      for (const release of releases.values()) {
        release()
      }
      releases.clear()
    }
  }
}

/** Mounted with the dispatcher's other services: follows this library's notices and the syncs. */
export function bindLocalTaskDispatcherForwarding(): () => void {
  const forwarding = createLocalTaskDispatcherForwarding()
  void forwarding.refreshWatches()
  const unsubscribeChanges = subscribeSelfLocalTaskChanges((scopes) => {
    if (scopes === null || scopes.includes('events')) {
      void forwarding.refreshWatches()
    }
  })
  const unsubscribeDomain = localTasksDomainStore.subscribe((state, previous) => {
    // Why the tasks: a pending ref is found once its host's library is read again.
    if (state.tasks !== previous.tasks) {
      void forwarding.resolvePending()
    }
    if (
      state.eventsByTaskId !== previous.eventsByTaskId ||
      state.partitions !== previous.partitions
    ) {
      void forwarding.forward(state)
    }
  })
  return () => {
    unsubscribeChanges()
    unsubscribeDomain()
    forwarding.dispose()
  }
}
