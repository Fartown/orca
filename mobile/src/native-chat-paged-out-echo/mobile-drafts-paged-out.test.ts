import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../../../src/shared/native-chat/native-chat-types'
import { useMobileNativeChatDrafts } from '../session/native-chat/composer/use-mobile-native-chat-drafts'
import { resetMobileNativeChatDraftStoreForTests } from '../session/native-chat/composer/mobile-native-chat-draft-store'

function row(id: string, role: NativeChatMessage['role'], timestamp: number): NativeChatMessage {
  return { id, role, blocks: [{ type: 'text', text: id }], timestamp, source: 'transcript' }
}

const atSend = [row('earlier-user', 'user', 90), row('boundary', 'assistant', 100)]
// A reconnect snapshot that shares no row with the window the send was made from.
const laterPage = [row('later-user', 'user', 5_000), row('later-answer', 'assistant', 5_010)]

type Props = { messages: NativeChatMessage[]; transcriptHasMore: boolean }

describe('phone Chat echoes after a reconnect replaces the window', () => {
  let renderer: ReactTestRenderer | null = null
  let state: ReturnType<typeof useMobileNativeChatDrafts> | null = null

  afterEach(() => {
    act(() => renderer?.unmount())
    resetMobileNativeChatDraftStoreForTests()
    renderer = null
    state = null
  })

  function Harness({ messages, transcriptHasMore }: Props): null {
    state = useMobileNativeChatDrafts({
      hostId: 'host',
      worktreeId: 'worktree',
      tabId: 'tab',
      sessionId: 'session',
      messages,
      launchDraft: null,
      transcriptLoading: false,
      transcriptSettled: true,
      transcriptHasMore
    })
    return null
  }

  async function renderSent(text: string, images?: string[]): Promise<void> {
    await act(async () => {
      renderer = create(createElement(Harness, { messages: atSend, transcriptHasMore: true }))
    })
    act(() => {
      const origin = state?.captureSendOrigin(text)
      if (origin) {
        state?.acceptSend(origin, text, images)
      }
    })
    expect(state?.pending).toHaveLength(1)
  }

  async function show(props: Props): Promise<void> {
    await act(async () => {
      renderer?.update(createElement(Harness, props))
    })
  }

  it.each([
    ['a text echo', 'only images', undefined],
    ['a photo echo', '', ['file:///a.jpg']]
  ])(
    'retires %s whose boundary and row both fell outside a truncated newer page',
    async (_label, text, images) => {
      await renderSent(text, images)
      await show({ messages: laterPage, transcriptHasMore: true })
      expect(state?.pending).toEqual([])
    }
  )

  it('keeps the echo when the newer page holds the whole transcript', async () => {
    await renderSent('only images')
    await show({ messages: laterPage, transcriptHasMore: false })
    expect(state?.pending.map((pending) => pending.text)).toEqual(['only images'])
  })
})
