import {
  addMobileNativeChatDraftImages,
  mobileNativeChatDraftDestination
} from '../session/native-chat/composer/drafts/mobile-native-chat-draft-inputs'
import type { PendingNativeChatImage } from '../session/native-chat/composer/attachments/mobile-native-chat-image-attachment'

/** Adds images another flow already uploaded (a file picked as File) to a scope's chat chips. */
export function addUploadedChatImages(
  scope: string,
  images: Omit<PendingNativeChatImage, 'id'>[]
): void {
  addMobileNativeChatDraftImages(mobileNativeChatDraftDestination(scope), images)
}
