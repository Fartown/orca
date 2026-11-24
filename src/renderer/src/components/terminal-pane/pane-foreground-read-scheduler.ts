import type {
  ForegroundReadReason,
  PaneForegroundAgentTrackerDeps
} from './pty-connection/agent-identity/foreground-process/pane-foreground-agent-tracker-contract'

export function createPaneForegroundReadScheduler(
  deps: PaneForegroundAgentTrackerDeps,
  read: (generation: number, retryIndex: number, reason: ForegroundReadReason) => Promise<void>
) {
  let disposed = false
  let generation = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let scheduled: ForegroundReadReason | null = null
  let active: ForegroundReadReason | null = null
  let paused: { reason: ForegroundReadReason; retryIndex: number } | null = null
  const contactKey = (): string | null => {
    const id = deps.getPtyId()
    return id && deps.isTrackablePtyId(id)
      ? deps.getReadContactKey
        ? deps.getReadContactKey(id)
        : id
      : null
  }
  let lastContact: string | null | undefined
  let unsubscribe: (() => void) | undefined
  const subscribeRemote = (): void => {
    const id = deps.getPtyId()
    if (!id || deps.isRemotePtyId?.(id) !== true) {
      unsubscribe?.()
      unsubscribe = undefined
    } else if (!unsubscribe && deps.subscribeReadContactChange) {
      lastContact = contactKey()
      unsubscribe = deps.subscribeReadContactChange(onContactChanged)
    }
  }
  const hasPending = (): boolean => scheduled !== null || active !== null
  const cancel = (): void => {
    generation += 1
    if (timer !== null) {
      clearTimeout(timer)
    }
    timer = null
    scheduled = active = null
    paused = null
  }
  const schedule = (delayMs: number, retryIndex: number, reason: ForegroundReadReason): void => {
    if (disposed) {
      return
    }
    subscribeRemote()
    const contact = contactKey()
    lastContact ??= contact
    if (contact === null) {
      paused = { reason, retryIndex }
      return
    }
    const token = generation
    scheduled = reason
    timer = setTimeout(() => {
      timer = null
      scheduled = null
      active = reason
      void read(token, retryIndex, reason).finally(() => {
        if (token === generation && active === reason) {
          active = null
        }
      })
    }, delayMs)
  }
  function onContactChanged(): void {
    const next = contactKey()
    if (lastContact === undefined) {
      lastContact = next
      return
    }
    if (disposed || next === lastContact) {
      return
    }
    lastContact = next
    const pending = paused ?? { reason: scheduled ?? active ?? 'visible-pty', retryIndex: 0 }
    const hadPending = hasPending()
    cancel()
    if (next === null) {
      paused = pending
      if (hadPending) {
        deps.onVisibleForegroundSettled?.('inconclusive')
      }
    } else {
      schedule(0, pending.retryIndex, pending.reason)
    }
  }
  return {
    cancel,
    schedule,
    contactKey,
    hasPending,
    isCurrent: (token: number) => !disposed && token === generation,
    hasCommandRead: () =>
      scheduled === 'command' ||
      active === 'command' ||
      scheduled === 'command-finished' ||
      active === 'command-finished',
    dispose: () => {
      disposed = true
      unsubscribe?.()
      cancel()
    }
  }
}
