import { useAppStore } from '@/store'
import { structuredAgentSessionPaneKey } from '../../../shared/structured-agent-session-projection'
import type {
  LocalTaskAttentionItem,
  LocalTaskSessionLink
} from '../../../shared/local-tasks/local-task-link-types'
import { localTaskItemClientKey } from './local-task-needs-you-rows'
import { localTasksClient } from './local-tasks-runtime-client'
import { isLocalTaskRowWritable, localTasksDomainStore } from './local-tasks-domain-store'
import type { LocalTaskProgressView } from './local-tasks-derived-state'

type SeenSession = Pick<LocalTaskSessionLink, 'id' | 'surface' | 'paneKey' | 'tabId' | 'sessionId'>

/** The client pane keys upstream may file a session's "seen" under; ids are already client form. */
function seenPaneKeys(link: SeenSession): string[] {
  const keys = link.paneKey ? [link.paneKey] : []
  if (link.surface === 'chat' && link.tabId && link.sessionId) {
    // Why: a chat's subject key is built from this window's own tab id for it.
    keys.push(structuredAgentSessionPaneKey(link.tabId, link.sessionId))
  }
  return keys
}

/**
 * Items whose session upstream recorded as seen (`acknowledgedAgentsByPaneKey`, the turn start the
 * user acknowledged) at or after the turn the item waits on: the user looked at it from the
 * sidebar, a tab or anywhere else.
 */
export function findLocalTaskItemsSeenElsewhere(
  items: readonly LocalTaskAttentionItem[],
  sessions: readonly SeenSession[],
  acknowledgedAt: Readonly<Record<string, number>>
): LocalTaskAttentionItem[] {
  const byId = new Map(sessions.map((session) => [session.id, session]))
  return items.filter((item) => {
    const link = byId.get(item.taskSessionId)
    return (
      link !== undefined &&
      seenPaneKeys(link).some((paneKey) => (acknowledgedAt[paneKey] ?? 0) >= item.since)
    )
  })
}

// Per item: 'sent', or the progress view a failed attempt saw. Shared by every path that marks
// an item seen, so opening a session and the pane it shows never mark the same item twice.
const attempted = new Map<string, 'sent' | LocalTaskProgressView | null>()

/** Marks one item seen in its library unless this window already did. */
export function acknowledgeLocalTaskItemOnce(item: LocalTaskAttentionItem): void {
  const domain = localTasksDomainStore.getState()
  const key = localTaskItemClientKey(item)
  if (attempted.get(key) === 'sent' || !isLocalTaskRowWritable(domain, item.taskSessionId)) {
    return
  }
  const view = domain.progress
  attempted.set(key, 'sent')
  void localTasksClient.acknowledgeAttention(item.key, item.taskSessionId).then(
    (result) => {
      if (!result.ok) {
        attempted.set(key, view)
      }
    },
    () => attempted.set(key, view)
  )
}

/**
 * Tells each library about items its user already saw elsewhere, once per item. A failed call is
 * not retried on its own: it waits for the next answer from the hosts (a new attention snapshot or
 * a change of contact), never for unrelated churn in this window.
 */
export function bindLocalTaskSeenForwarding(): () => void {
  let lastInputs: readonly unknown[] = []

  const run = (): void => {
    const domain = localTasksDomainStore.getState()
    const acknowledged = useAppStore.getState().acknowledgedAgentsByPaneKey
    const inputs = [acknowledged, domain.progress, domain.links.sessions, domain.partitions]
    if (inputs.every((value, at) => value === lastInputs[at])) {
      return
    }
    lastInputs = inputs
    const items = domain.progress?.items ?? []
    const listed = new Set(items.map(localTaskItemClientKey))
    for (const key of attempted.keys()) {
      if (!listed.has(key)) {
        attempted.delete(key)
      }
    }
    const view = domain.progress
    for (const item of findLocalTaskItemsSeenElsewhere(
      items,
      domain.links.sessions,
      acknowledged
    )) {
      const previous = attempted.get(localTaskItemClientKey(item))
      if (previous === undefined || (previous !== 'sent' && previous !== view)) {
        acknowledgeLocalTaskItemOnce(item)
      }
    }
  }

  const unsubscribeApp = useAppStore.subscribe(run)
  const unsubscribeLibrary = localTasksDomainStore.subscribe(run)
  run()
  return () => {
    unsubscribeApp()
    unsubscribeLibrary()
    attempted.clear()
  }
}
