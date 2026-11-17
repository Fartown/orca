import type { NativeChatMessage } from '../native-chat/native-chat-types'
import type { NativeChatPendingSend } from '../native-chat/transcript/native-chat-pending-sends'

export type NativeChatLoadedWindow = {
  /** Older transcript rows exist beyond the loaded messages. */
  hasMore: boolean
  /** The loaded messages come from a finished read of the current session. */
  settled: boolean
}

/**
 * Retire echoes the loaded window has moved past. Reconciliation only sees loaded rows, so once a
 * whole window of newer rows replaces both an echo's boundary and its own row, nothing can match it.
 */
export function retirePagedOutPendingSends<T extends NativeChatPendingSend>(
  pending: T[],
  messages: readonly NativeChatMessage[],
  window: NativeChatLoadedWindow
): T[] {
  if (pending.length === 0 || !window.settled || !window.hasMore) {
    return pending
  }
  const oldest = oldestTranscriptTimestamp(messages)
  if (oldest === null) {
    return pending
  }
  const loadedIds = new Set(messages.map((message) => message.id))
  const next = pending.filter((entry) => !isPagedOut(entry, loadedIds, oldest))
  return next.length === pending.length ? pending : next
}

function isPagedOut(
  entry: NativeChatPendingSend,
  loadedIds: ReadonlySet<string>,
  oldestLoaded: number
): boolean {
  // A failed or unconfirmed write may hold the only copy of the message.
  if (entry.delivery !== undefined || entry.writeUnconfirmedAt !== undefined) {
    return false
  }
  if (typeof entry.afterMessageId !== 'string' || loadedIds.has(entry.afterMessageId)) {
    return false
  }
  // Both sides use the transcript host's clock.
  return (
    typeof entry.afterMessageTimestamp === 'number' && oldestLoaded > entry.afterMessageTimestamp
  )
}

function oldestTranscriptTimestamp(messages: readonly NativeChatMessage[]): number | null {
  let oldest: number | null = null
  for (const message of messages) {
    if (message.source !== 'transcript' || message.timestamp === null) {
      continue
    }
    if (oldest === null || message.timestamp < oldest) {
      oldest = message.timestamp
    }
  }
  return oldest
}
