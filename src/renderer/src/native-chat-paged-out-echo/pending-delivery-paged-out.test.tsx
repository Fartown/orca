// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../../../shared/native-chat/native-chat-types'
import { useNativeChatPendingDelivery } from '../components/native-chat/use-native-chat-pending-delivery'
import { clearPendingSendCacheForTests } from '../components/native-chat/native-chat-pending'

type Session = Parameters<typeof useNativeChatPendingDelivery>[0]['session']

function row(id: string, role: NativeChatMessage['role'], timestamp: number): NativeChatMessage {
  return { id, role, blocks: [{ type: 'text', text: id }], timestamp, source: 'transcript' }
}

const atSend: Session = {
  messages: [row('earlier-user', 'user', 90), row('boundary', 'assistant', 100)],
  readPhase: 'ready',
  sessionId: 'session-1',
  hasMore: true
}
// The pane was hidden while the row landed; on return the newest page is all later work.
const laterPage = [row('later-user', 'user', 5_000), row('later-answer', 'assistant', 5_010)]

function renderSentEcho() {
  const hook = renderHook(
    ({ session }) => useNativeChatPendingDelivery({ paneKey: 'pane', agent: 'claude', session }),
    { initialProps: { session: atSend } }
  )
  act(() => {
    hook.result.current.record('only images')
  })
  expect(hook.result.current.pending.map((entry) => entry.text)).toEqual(['only images'])
  return hook
}

beforeEach(() => {
  clearPendingSendCacheForTests()
})
afterEach(() => {
  cleanup()
})

describe('terminal Chat echoes after the pane returns to a newer page', () => {
  it('retires the echo once a settled newer page has replaced its boundary and row', () => {
    const { result, rerender } = renderSentEcho()
    rerender({ session: { ...atSend, messages: laterPage, readPhase: 'loading' } })
    expect(result.current.pending).toHaveLength(1)
    rerender({ session: { ...atSend, messages: laterPage } })
    expect(result.current.pending).toEqual([])
  })

  it('keeps the echo when the newer read holds the whole transcript', () => {
    const { result, rerender } = renderSentEcho()
    rerender({ session: { ...atSend, messages: laterPage, hasMore: false } })
    expect(result.current.pending).toHaveLength(1)
  })

  it('keeps an echo whose write failed after the window moves on', () => {
    const { result, rerender } = renderSentEcho()
    act(() => {
      result.current.reject(result.current.pending[0]!.id)
    })
    rerender({ session: { ...atSend, messages: laterPage } })
    expect(result.current.pending.map((entry) => entry.delivery)).toEqual(['rejected'])
  })
})
