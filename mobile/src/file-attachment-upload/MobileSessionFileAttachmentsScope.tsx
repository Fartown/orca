import { createContext, useContext, type ReactNode } from 'react'
import type { MobileNativeChatImageAttachments } from '../session/native-chat/composer/attachments/use-mobile-native-chat-image-attachments'
import { MobileAttachmentSourceSheet } from './MobileAttachmentSourceSheet'
import type { MobileFileAttachments } from './use-mobile-file-attachments'

// Stable for the session (a useCallback chain), so the hidden chat tree is not re-rendered by it.
const ChatAttachSheetContext = createContext<(() => void) | null>(null)

/** Lets the chat composer reach the Photo / File sheet without threading it through the
 *  session content files, and mounts that sheet beside the session's other sheets. */
export function MobileSessionFileAttachmentsScope({
  files,
  children
}: {
  files: MobileFileAttachments | undefined
  children: ReactNode
}): React.JSX.Element {
  return (
    <ChatAttachSheetContext.Provider value={files?.openChatSheet ?? null}>
      {children}
      {files ? <MobileAttachmentSourceSheet {...files.sheet} /> : null}
    </ChatAttachSheetContext.Provider>
  )
}

/** Outside a session scope no attach sheet is mounted, so the button keeps the plain photo pick. */
export function useMobileChatFileAttachments(
  images: Pick<MobileNativeChatImageAttachments, 'attachImage'>
): { readonly openChatSheet: () => void } {
  const openChatSheet = useContext(ChatAttachSheetContext)
  return { openChatSheet: openChatSheet ?? (() => void images.attachImage('library')) }
}
