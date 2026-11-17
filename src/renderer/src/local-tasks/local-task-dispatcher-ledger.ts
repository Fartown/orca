import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import type {
  LocalTaskInboxItem,
  LocalTaskProposal,
  LocalTaskWatch
} from '../../../shared/local-tasks/local-task-dispatcher-types'
import { localTaskDispatcherClientFor } from './local-task-dispatcher-client'
import { knownDispatcherPaneKey } from './local-task-dispatcher-session'
import { subscribeLocalTaskDispatcherChanges } from './local-task-dispatcher-changes'
import {
  getLocalTaskDispatcherEndpoint,
  getLocalTaskDispatcherEpoch,
  isLocalTaskDispatcherSourceCurrent
} from './local-task-dispatcher-source'
import { runLocalTaskWrite } from './local-task-writes'

/** What the person sees of the dispatcher's records (REQ-031): it keeps no other memory. */
type LedgerState = {
  loaded: boolean
  watches: LocalTaskWatch[]
  /** Facts the dispatcher has not acked yet; it is woken for them when idle. */
  unread: LocalTaskInboxItem[]
  moreUnread: boolean
  /** Its executed proposals, newest first, with the tasks each one made. */
  dispatched: LocalTaskProposal[]
  error: string | null
}

const EMPTY: LedgerState = {
  loaded: false,
  watches: [],
  unread: [],
  moreUnread: false,
  dispatched: [],
  error: null
}

export const localTaskDispatcherLedgerStore = createStore<LedgerState>(() => EMPTY)

export function useLocalTaskDispatcherLedger<T>(select: (state: LedgerState) => T): T {
  return useStore(localTaskDispatcherLedgerStore, select)
}

const LEDGER_INBOX_LIMIT = 50
const LEDGER_DISPATCHED_LIMIT = 10
let latestRead = 0

export function resetLocalTaskDispatcherLedger(): void {
  latestRead += 1
  localTaskDispatcherLedgerStore.setState(EMPTY)
}

/** Re-reads the ledger from this window's own library; a slow read never overwrites a later one. */
export async function refreshLocalTaskDispatcherLedger(): Promise<void> {
  const paneKey = knownDispatcherPaneKey()
  const sequence = ++latestRead
  const endpoint = getLocalTaskDispatcherEndpoint()
  const epoch = getLocalTaskDispatcherEpoch()
  if (!isLocalTaskDispatcherSourceCurrent(endpoint, epoch)) {
    return
  }
  const client = localTaskDispatcherClientFor(endpoint)
  if (!paneKey) {
    localTaskDispatcherLedgerStore.setState({ ...EMPTY, loaded: true })
    return
  }
  try {
    const [watches, inbox, executed] = await Promise.all([
      client.watches(paneKey),
      client.inbox(paneKey, LEDGER_INBOX_LIMIT),
      client.list('executed')
    ])
    if (sequence !== latestRead || !isLocalTaskDispatcherSourceCurrent(endpoint, epoch)) {
      return
    }
    const conversationId = inbox.ok ? inbox.inbox.conversationId : null
    localTaskDispatcherLedgerStore.setState({
      loaded: true,
      error: null,
      watches: watches.ok ? watches.watches : [],
      unread: inbox.ok ? inbox.inbox.items : [],
      moreUnread: inbox.ok && inbox.inbox.more,
      dispatched: executed.proposals
        .filter((proposal) => proposal.conversationId === conversationId)
        .sort((a, b) => (b.decidedAt ?? b.createdAt) - (a.decidedAt ?? a.createdAt))
        .slice(0, LEDGER_DISPATCHED_LIMIT)
    })
  } catch (error) {
    if (sequence === latestRead && isLocalTaskDispatcherSourceCurrent(endpoint, epoch)) {
      localTaskDispatcherLedgerStore.setState({
        loaded: true,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }
}

/** While the ledger is shown it follows the library's change notices; nothing polls. */
export function followLocalTaskDispatcherLedger(): () => void {
  void refreshLocalTaskDispatcherLedger()
  return subscribeLocalTaskDispatcherChanges((scopes) => {
    if (
      scopes === null ||
      scopes.some((scope) => scope === 'events' || scope === 'tasks' || scope === 'attention')
    ) {
      void refreshLocalTaskDispatcherLedger()
    }
  }, resetLocalTaskDispatcherLedger)
}

/** The person stops the dispatcher following a task; its records stay. */
export async function unwatchLocalTaskFromLedger(taskId: string): Promise<void> {
  const paneKey = knownDispatcherPaneKey()
  if (!paneKey) {
    return
  }
  const endpoint = getLocalTaskDispatcherEndpoint()
  const epoch = getLocalTaskDispatcherEpoch()
  if (!isLocalTaskDispatcherSourceCurrent(endpoint, epoch)) {
    return
  }
  const client = localTaskDispatcherClientFor(endpoint)
  await runLocalTaskWrite(() => client.unwatch(paneKey, taskId))
  void refreshLocalTaskDispatcherLedger()
}
