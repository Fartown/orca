import { clearStalePreHandlerPtyExitsOnSpawn } from '@/components/terminal-pane/pty-transport/delivery/pty-pre-handler-buffer'
import { forgetHibernationPtyBinding } from '@/lib/agent-session/hibernation/agent-hibernation-pane-age'
import { useAppStore } from '@/store'
import type { PtySessionLifecycle } from '../../../shared/terminal/pty/lifecycle/pty-listed-session'
import { makePaneKey } from '../../../shared/workspace-layout/stable-pane-id'

/** Drop stale prior-incarnation exit tombstones and reset hibernation age whenever the host spawns a PTY id. */
export function handleHostSpawnedPty(
  event: Pick<PtySessionLifecycle, 'id' | 'incarnationId'>
): void {
  if (!event.id) {
    return
  }
  clearStalePreHandlerPtyExitsOnSpawn(event.id, event.incarnationId)
  const layoutsByTabId = useAppStore.getState().terminalLayoutsByTabId
  for (const [tabId, layout] of Object.entries(layoutsByTabId)) {
    const ptyIdsByLeafId = layout?.ptyIdsByLeafId
    if (!ptyIdsByLeafId) {
      continue
    }
    for (const [leafId, ptyId] of Object.entries(ptyIdsByLeafId)) {
      if (ptyId !== event.id) {
        continue
      }
      try {
        forgetHibernationPtyBinding(makePaneKey(tabId, leafId))
      } catch {
        // Ignore malformed legacy tab/leaf ids.
      }
    }
  }
}

/** Subscribe once per renderer lifetime so host respawns (including background and split paths) clear prior-lifetime exit tombstones. */
export function registerHostSpawnedTerminalRecovery(unsubs: (() => void)[]): void {
  const unsubscribe =
    typeof window === 'undefined'
      ? undefined
      : window.api?.pty?.onSpawned?.((event) => {
          handleHostSpawnedPty(event)
        })
  if (unsubscribe) {
    unsubs.push(unsubscribe)
  }
}
