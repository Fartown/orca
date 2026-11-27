import { createElement, type ComponentProps, type ReactElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MobileNativeChatOverlay } from '../session/native-chat/MobileNativeChatOverlay'
import type { MobileNativeChatController } from '../session/native-chat/mobile-native-chat-controller-contract'
import { findByHostType } from '../fork-test-support/test-support/react-test-renderer-host-nodes'
import { MobileSessionFileAttachmentsScope } from './MobileSessionFileAttachmentsScope'
import type { MobileFileAttachments } from './use-mobile-file-attachments'

vi.mock('react-native', () => ({
  StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {}, absoluteFillObject: {} },
  View: 'View'
}))
vi.mock('../platform/accessibility/use-reduced-motion', () => ({
  useReducedMotionEnabled: () => null
}))
vi.mock('../session/native-chat/MobileNativeChatView', () => ({ MobileNativeChatView: 'ChatView' }))
vi.mock('./MobileAttachmentSourceSheet', () => ({ MobileAttachmentSourceSheet: 'SourceSheet' }))
vi.mock('../session/native-chat/visual/MobileNativeChatVisual', () => ({
  useMobileNativeChatVisualRenderer: () => null
}))
vi.mock(
  '../session/native-chat/transcript/message-actions/MobileNativeChatRowOverlaysHost',
  () => ({
    MobileNativeChatRowOverlaysHost: 'View'
  })
)
vi.mock('../session/native-chat/composer/menus/use-mobile-native-chat-composer-tray', () => ({
  useMobileNativeChatComposerTray: () => null
}))
vi.mock('../session/native-chat/links/use-mobile-native-chat-markdown-links', () => ({
  useMobileNativeChatMarkdownLinks: () => null
}))

type OverlayProps = ComponentProps<typeof MobileNativeChatOverlay>

function overlay(acceptsImages: boolean, attachImage: OverlayProps['images']['attachImage']) {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the attach button reads only these controller members; the overlay's other reads tolerate their absence.
  const controller = {
    showNativeChat: true,
    nativeChatSession: { messages: [], status: 'ready' },
    nativeChatAgent: 'claude',
    nativeChatAcceptsImages: acceptsImages,
    nativeChatQueued: { cards: [], sessionKey: 'session-a' },
    nativeChatWorkerApprovals: { open: [] },
    chatPending: [],
    chatImagePreviewsByMessageId: {}
  } as unknown as MobileNativeChatController
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the remaining props feed members the attach button never reads.
  const props = {
    controller,
    worktreePath: null,
    connState: 'connected',
    onOpenFile: vi.fn(),
    onRunInTerminal: vi.fn(),
    images: {
      attachments: [],
      isAttaching: false,
      attachImage,
      removeAttachment: vi.fn(),
      addUploadedImages: vi.fn(),
      sendNativeChat: vi.fn(async () => true)
    },
    inputLockReason: null,
    sendErrorMessage: null,
    onClearSendError: vi.fn(),
    sendSurfaceId: 'tab-a',
    sessionId: null,
    getSendCompletionGeneration: () => 0,
    keyboardInset: 0,
    hostName: null,
    linkOpenMode: 'ask'
  } as unknown as OverlayProps
  return createElement(MobileNativeChatOverlay, props)
}

function sessionFiles(openChatSheet: () => void): MobileFileAttachments {
  return {
    openTerminalSheet: vi.fn(),
    openChatSheet,
    attachFileToTerminal: vi.fn(),
    isUploadingToTerminal: false,
    isUploadingToChat: false,
    sheet: { visible: false, onPhoto: vi.fn(), onFile: vi.fn(), onClose: vi.fn() }
  }
}

let renderer: ReactTestRenderer | null = null
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
})

async function render(element: ReactElement): Promise<ReactTestRenderer> {
  await act(async () => {
    renderer = create(element)
  })
  return renderer!
}

describe('chat attach button inside a session', () => {
  it('opens the Photo / File sheet instead of the photo library', async () => {
    const openChatSheet = vi.fn()
    const attachImage = vi.fn(async () => {})
    const tree = await render(
      <MobileSessionFileAttachmentsScope files={sessionFiles(openChatSheet)}>
        {overlay(true, attachImage)}
      </MobileSessionFileAttachmentsScope>
    )

    await act(async () => findByHostType(tree.root, 'ChatView').props.onAttachImage())

    expect(openChatSheet).toHaveBeenCalledOnce()
    expect(attachImage).not.toHaveBeenCalled()
    expect(findByHostType(tree.root, 'SourceSheet').props.visible).toBe(false)
  })

  it('offers no attach button when the agent takes no images', async () => {
    const tree = await render(
      <MobileSessionFileAttachmentsScope files={sessionFiles(vi.fn())}>
        {overlay(
          false,
          vi.fn(async () => {})
        )}
      </MobileSessionFileAttachmentsScope>
    )

    expect(findByHostType(tree.root, 'ChatView').props.onAttachImage).toBeUndefined()
  })
})

describe('chat attach button outside a session scope', () => {
  it('keeps the photo pick, since no attach sheet is mounted there', async () => {
    const attachImage = vi.fn(async () => {})
    const tree = await render(overlay(true, attachImage))

    await act(async () => findByHostType(tree.root, 'ChatView').props.onAttachImage())

    expect(attachImage).toHaveBeenCalledExactlyOnceWith('library')
  })
})
