import { describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../native-chat/native-chat-types'
import {
  prunePendingSends,
  type NativeChatPendingSend
} from '../native-chat/transcript/native-chat-pending-sends'
import { retirePagedOutPendingSends } from './retire-paged-out-pending-sends'

function row(id: string, role: NativeChatMessage['role'], timestamp: number): NativeChatMessage {
  return { id, role, blocks: [{ type: 'text', text: id }], timestamp, source: 'transcript' }
}

// The send went out after the "boundary" row at t=100; its own row landed at t=110.
const send: NativeChatPendingSend = {
  id: 'send-1',
  text: 'only images',
  sentAt: 105,
  afterMessageId: 'boundary',
  afterMessageTimestamp: 100
}
// A truncated newest page written long after the send: it holds neither the boundary nor the row.
const laterWindow = [row('later-user', 'user', 5_000), row('later-answer', 'assistant', 5_010)]
const truncated = { hasMore: true, settled: true }

function reconcile(
  pending: NativeChatPendingSend[],
  messages: readonly NativeChatMessage[],
  window = truncated
): NativeChatPendingSend[] {
  return retirePagedOutPendingSends(prunePendingSends(pending, messages), messages, window)
}

describe('retirePagedOutPendingSends', () => {
  it('retires an echo once the loaded window has moved past both its boundary and its row', () => {
    expect(prunePendingSends([send], laterWindow)).toEqual([send])
    expect(reconcile([send], laterWindow)).toEqual([])
  })

  it('keeps the echo while the window still reaches back to its boundary time', () => {
    // The boundary id was replaced, but loaded rows older than it prove the row would be in view.
    const window = [row('older', 'assistant', 90), ...laterWindow]
    const pending = [send]
    expect(reconcile(pending, window)).toBe(pending)
  })

  it('keeps the echo while its boundary row is still loaded', () => {
    const window = [{ ...row('boundary', 'assistant', 100), timestamp: 6_000 }, ...laterWindow]
    expect(reconcile([send], window)).toEqual([send])
  })

  it('keeps the echo when the whole transcript is loaded', () => {
    const pending = [send]
    expect(reconcile(pending, laterWindow, { hasMore: false, settled: true })).toBe(pending)
  })

  it('keeps the echo until the read settles', () => {
    const pending = [send]
    expect(reconcile(pending, laterWindow, { hasMore: true, settled: false })).toBe(pending)
  })

  it.each([
    ['a rejected write', { delivery: 'rejected' as const }],
    ['an unconfirmed delivery', { delivery: 'unconfirmed' as const }],
    ['a write still awaiting acknowledgment', { writeUnconfirmedAt: 106 }]
  ])('keeps %s because the bubble may hold the only copy', (_label, outcome) => {
    const pending = [{ ...send, ...outcome }]
    expect(reconcile(pending, laterWindow)).toBe(pending)
  })

  it.each([
    ['no boundary row', { afterMessageId: null }],
    ['no host clock on its boundary', { afterMessageTimestamp: null }]
  ])('keeps an echo sent with %s', (_label, boundary) => {
    const pending = [{ ...send, ...boundary }]
    expect(reconcile(pending, laterWindow)).toBe(pending)
  })

  it('reads the window age from transcript rows only', () => {
    // A hook preview carries no transcript clock and must not make the window look older.
    const preview: NativeChatMessage = { ...row('preview', 'assistant', 50), source: 'hook' }
    expect(reconcile([send], [preview, ...laterWindow])).toEqual([])
  })
})
