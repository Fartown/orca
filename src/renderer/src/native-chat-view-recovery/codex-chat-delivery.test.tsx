// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNativeChatPtyComposerSend } from '../components/native-chat/use-native-chat-pty-composer-send'
import {
  NATIVE_CHAT_UNCONFIRMED_SEND_HOLD_MS,
  useNativeChatPendingDelivery
} from '../components/native-chat/use-native-chat-pending-delivery'
import { clearPendingSendCacheForTests } from '../components/native-chat/native-chat-pending'
import { resetNativeChatPtySendQueuesForTests } from '../components/native-chat/native-chat-pty-send-queue'
import type { NativeChatMessage } from '../../../shared/native-chat/native-chat-types'

const writes = vi.hoisted(() => ({
  verified: vi.fn<(...args: unknown[]) => Promise<boolean>>(),
  unverified: vi.fn(() => true),
  clearDraft: vi.fn()
}))

vi.mock('@/runtime/runtime-terminal-verified-input', () => ({
  sendRuntimePtyInputVerified: writes.verified
}))
vi.mock('@/runtime/runtime-terminal-inspection', () => ({
  sendRuntimePtyInput: writes.unverified
}))
vi.mock('@/store', () => ({
  useAppStore: { getState: () => ({ clearNativeChatLaunchDraft: writes.clearDraft }) }
}))
vi.mock('@/lib/native-chat-telemetry', () => ({ emitNativeChatMessageSent: vi.fn() }))
vi.mock('../components/native-chat/native-chat-composer-draft-store', () => ({
  readNativeChatComposerDraft: () => ({ document: undefined, pastedTextFiles: [] })
}))

const message = 'delivery probe'
const noMessages: NativeChatMessage[] = []

function renderSend(ptyId: string, agent: 'codex' | 'claude' = 'codex', imagePaths: string[] = []) {
  return renderHook(
    ({ messages }) => {
      const delivery = useNativeChatPendingDelivery({
        paneKey: 'tab:leaf',
        agent,
        session: { messages, readPhase: 'ready', sessionId: 'session-1' }
      })
      const send = useNativeChatPtyComposerSend({
        agent,
        draft: message,
        draftScopeKey: 'tab:leaf',
        imageAttachments: imagePaths.map((path) => ({ path })),
        disabled: false,
        isDispatchingSessionOption: false,
        launchDraftResolved: true,
        resolveTarget: () => ({ ptyId }),
        classifySend: () => 'chat',
        onOptimisticSend: delivery.record,
        optimisticSendOutcome: delivery,
        sessionOptionsSurface: null,
        terminalTabId: 'tab',
        trackPendingSend: vi.fn(),
        setDraft: vi.fn(),
        setCaret: vi.fn(),
        clearSkillOrigin: vi.fn(),
        clearImageAttachments: vi.fn(),
        setNotice: vi.fn()
      })
      return { delivery, send }
    },
    { initialProps: { messages: noMessages } }
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  clearPendingSendCacheForTests()
  resetNativeChatPtySendQueuesForTests()
  writes.verified.mockResolvedValue(true)
})

afterEach(() => {
  cleanup()
  resetNativeChatPtySendQueuesForTests()
  vi.useRealTimers()
})

describe('Codex terminal chat delivery truth', () => {
  it('preserves the existing Claude acknowledgment policy', async () => {
    const { result } = renderSend('local@@pty', 'claude')
    await act(async () => result.current.send())
    expect(writes.verified).toHaveBeenCalledExactlyOnceWith(
      'local@@pty',
      message,
      'driving',
      undefined
    )
  })

  it.each(['local@@pty', 'ssh:host@@pty', 'remote:host@@terminal'])(
    'keeps a refused message with a failure notice, without sending Enter: %s',
    async (ptyId) => {
      writes.verified.mockResolvedValueOnce(false)
      const { result } = renderSend(ptyId)
      await act(async () => result.current.send())
      expect(writes.verified).toHaveBeenCalledExactlyOnceWith(ptyId, message, 'driving', {
        requireWriteSettlement: true
      })
      expect(writes.unverified).toHaveBeenCalledExactlyOnceWith(ptyId, '\x15', 'driving')
      expect(result.current.delivery.pending[0]).toMatchObject({
        text: message,
        delivery: 'rejected'
      })
      expect([...result.current.delivery.notices.values()][0]?.text).toBe('Message not sent')
      await act(() => vi.advanceTimersByTimeAsync(60_000))
      expect(writes.verified).toHaveBeenCalledOnce()
    }
  )

  it('waits for body acceptance before scheduling Enter', async () => {
    const body = Promise.withResolvers<boolean>()
    writes.verified.mockReturnValueOnce(body.promise)
    const { result } = renderSend('remote:host@@terminal')
    act(() => result.current.send())
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(writes.verified).toHaveBeenCalledOnce()
    expect(writes.unverified).toHaveBeenCalledExactlyOnceWith(
      'remote:host@@terminal',
      '\x15',
      'driving'
    )
    await act(async () => body.resolve(true))
    await act(() => vi.advanceTimersByTimeAsync(499))
    expect(writes.verified).toHaveBeenCalledOnce()
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(writes.verified).toHaveBeenCalledTimes(2)
    expect(writes.verified.mock.calls[1]?.[1]).toBe('\r')
  })

  it('keeps image attachments with a refused image write and does not submit', async () => {
    writes.verified.mockResolvedValueOnce(false)
    const { result } = renderSend('remote:host@@terminal', 'codex', ['/tmp/delivery-fixture.png'])
    await act(async () => result.current.send())
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(writes.verified).toHaveBeenCalledOnce()
    expect(writes.verified.mock.calls[0]?.[3]).toEqual({ requireWriteSettlement: true })
    expect(result.current.delivery.pending[0]).toMatchObject({
      text: message,
      imagePaths: ['/tmp/delivery-fixture.png'],
      delivery: 'rejected'
    })
  })

  it('flags a lost acknowledgment without replaying the body', async () => {
    writes.verified.mockRejectedValueOnce(new Error('reply lost'))
    const { result } = renderSend('remote:host@@terminal')
    await act(async () => result.current.send())
    await act(() => vi.advanceTimersByTimeAsync(NATIVE_CHAT_UNCONFIRMED_SEND_HOLD_MS))
    expect(result.current.delivery.pending[0]).toMatchObject({
      text: message,
      delivery: 'unconfirmed'
    })
    expect([...result.current.delivery.notices.values()][0]?.text).toMatch(/Delivery unconfirmed/)
    expect(writes.verified.mock.calls.filter((call) => call[1] !== '\r')).toHaveLength(1)
  })

  it('reconciles a successful send against its provider transcript', async () => {
    const { result, rerender } = renderSend('local@@pty')
    await act(async () => result.current.send())
    await act(() => vi.advanceTimersByTimeAsync(500))
    expect(writes.verified).toHaveBeenCalledTimes(2)
    expect(result.current.delivery.pending).toHaveLength(1)
    rerender({
      messages: [
        {
          id: 'provider-user',
          role: 'user',
          blocks: [{ type: 'text', text: message }],
          timestamp: Date.now(),
          source: 'transcript'
        },
        {
          id: 'provider-answer',
          role: 'assistant',
          blocks: [{ type: 'text', text: 'received' }],
          timestamp: Date.now() + 1,
          source: 'transcript'
        }
      ]
    })
    expect(result.current.delivery.pending).toEqual([])
    expect(result.current.delivery.notices.size).toBe(0)
  })
})
