import { triggerError, triggerSelection } from '../platform/haptics/haptics'
import type { MobileImageSource } from '../platform/media-picking/media-picker-contract'
import type { MobileSessionAccessorySelectionModel } from '../terminal/session/accessory-keys/use-mobile-session-accessory-selection'
import type { MobileNativeChatImageAttachments } from '../session/native-chat/composer/attachments/use-mobile-native-chat-image-attachments'
import { addUploadedChatImages } from './add-uploaded-chat-images'
import { useMobileFileAttachments, type MobileFileAttachments } from './use-mobile-file-attachments'

type SessionAttachmentParts = {
  readonly agent: string | null | undefined
  readonly attachImage: (source: MobileImageSource) => Promise<void>
  readonly nativeChatImages: MobileNativeChatImageAttachments
  readonly beforeTerminalSend: (terminal: string) => Promise<boolean>
}

/** Wires the session route's state into file attachments, so the route only calls this once. */
export function useMobileSessionFileAttachments(
  scope: MobileSessionAccessorySelectionModel,
  parts: SessionAttachmentParts
): MobileFileAttachments {
  const structured = scope.activeSessionTab?.type === 'agent-session'
  return useMobileFileAttachments({
    client: scope.client,
    worktreeId: scope.worktreeId,
    connState: scope.connState,
    agent: parts.agent,
    deviceTokenRef: scope.deviceTokenRef,
    getActiveWorktreeConnectionId: scope.getActiveWorktreeConnectionId,
    showToast: scope.showToast,
    onSuccess: triggerSelection,
    onError: triggerError,
    terminal: {
      activeHandle: scope.activeHandle,
      canSend: scope.canSend,
      beforeSend: parts.beforeTerminalSend,
      attachPhoto: () => void parts.attachImage('library')
    },
    chat: {
      scopeKey: scope.nativeChatScopeKey,
      // Same gate the image chips use: a structured session needs the host, a TUI its input lease.
      enabled: structured
        ? scope.connState === 'connected'
        : scope.nativeChatInputLeaseReady && scope.activeHandle !== null,
      attachPhoto: () => void parts.nativeChatImages.attachImage('library'),
      addUploadedImages: addUploadedChatImages,
      setComposerText: scope.nativeChatController.setChatComposerText
    }
  })
}
