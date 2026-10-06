import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction
} from 'react'
import {
  appendFileAttachmentPathToDraft,
  isAgentImageAttachmentName
} from '../../../src/shared/file-attachment-upload/file-attachment-delivery-text'
import { FILE_ATTACHMENT_MAX_BYTES } from '../../../src/shared/file-attachment-upload/file-attachment-upload-limits'
import type { RpcClient } from '../transport/rpc-client'
import type { ConnectionState } from '../transport/types'
import { useFileAttachmentPicker } from './file-attachment-picker'
import { uploadAttachmentFile, type UploadedAttachmentFile } from './file-attachment-upload-client'
import { writeAttachmentToTerminal } from './file-attachment-terminal-write'
import { fileAttachmentFailureToast } from './file-attachment-failure-toast'
import {
  FileAttachmentShellLimitError,
  FileAttachmentTooLargeError,
  type PickedAttachmentFile
} from './picked-attachment-file'

type CurrentRef<T> = { readonly current: T }

/** A host-uploaded image as the native-chat composer holds it until submit. */
export type FileAttachmentChatImage = { path: string; previewUri: string }

export type MobileFileAttachmentsArgs = {
  readonly client: RpcClient | null
  readonly worktreeId: string
  readonly connState: ConnectionState
  readonly agent?: string | null
  readonly deviceTokenRef: CurrentRef<string | null>
  readonly getActiveWorktreeConnectionId: () => Promise<string | null>
  readonly showToast: (message: string, durationMs?: number) => void
  readonly onSuccess: () => void
  readonly onError: () => void
  readonly terminal: {
    readonly activeHandle: string | null
    readonly canSend: boolean
    readonly beforeSend: (terminal: string) => Promise<boolean>
    readonly attachPhoto: () => void
  }
  readonly chat: {
    readonly scopeKey: string | null
    readonly enabled: boolean
    readonly attachPhoto: () => void
    readonly addUploadedImages: (scope: string, images: FileAttachmentChatImage[]) => void
    /** Bound to the draft that was active when it was read, so a tab switch cannot redirect it. */
    readonly setComposerText: Dispatch<SetStateAction<string>>
  }
}

export type AttachmentSourceSheetProps = {
  readonly visible: boolean
  readonly onPhoto: () => void
  readonly onFile: () => void
  readonly onClose: () => void
}

export type MobileFileAttachments = {
  readonly openTerminalSheet: () => void
  readonly openChatSheet: () => void
  readonly attachFileToTerminal: () => void
  readonly isUploadingToTerminal: boolean
  readonly isUploadingToChat: boolean
  readonly sheet: AttachmentSourceSheetProps
}

type SheetTarget = 'terminal' | 'chat'

function refuseOversize(file: PickedAttachmentFile, pickerMaxBytes: number): void {
  if (file.byteLength > FILE_ATTACHMENT_MAX_BYTES) {
    throw new FileAttachmentTooLargeError(FILE_ATTACHMENT_MAX_BYTES)
  }
  if (file.byteLength > pickerMaxBytes) {
    throw new FileAttachmentShellLimitError(pickerMaxBytes)
  }
}

function chatImageFor(
  file: PickedAttachmentFile,
  uploaded: UploadedAttachmentFile
): FileAttachmentChatImage | null {
  if (!isAgentImageAttachmentName(uploaded.fileName)) {
    return null
  }
  if (file.previewUri) {
    return { path: uploaded.path, previewUri: file.previewUri }
  }
  if (uploaded.inlineImageBase64 !== undefined) {
    const mime = file.mimeType?.startsWith('image/') ? file.mimeType : 'image/png'
    return { path: uploaded.path, previewUri: `data:${mime};base64,${uploaded.inlineImageBase64}` }
  }
  return null
}

/**
 * Attaching from the session's two inputs: a sheet offers Photo (the existing image flow) or File
 * (any type, streamed to the workspace host). A terminal gets the path typed in; native chat holds
 * an agent-readable image as a chip and any other file as an `@path` in the draft.
 */
export function useMobileFileAttachments(args: MobileFileAttachmentsArgs): MobileFileAttachments {
  const picker = useFileAttachmentPicker()
  const [sheetTarget, setSheetTarget] = useState<SheetTarget | null>(null)
  const [uploadingTerminal, setUploadingTerminal] = useState(false)
  const [uploadingChat, setUploadingChat] = useState(false)
  const argsRef = useRef(args)
  useLayoutEffect(() => {
    argsRef.current = args
  })

  const reportFailure = useCallback((error: unknown) => {
    const current = argsRef.current
    current.onError()
    current.showToast(fileAttachmentFailureToast(error, current.connState), 2000)
  }, [])

  const attachFileToTerminal = useCallback(async (): Promise<void> => {
    const { client, terminal, worktreeId } = argsRef.current
    const handle = terminal.activeHandle
    if (!client || !handle || !terminal.canSend) {
      return
    }
    let file: PickedAttachmentFile | undefined
    try {
      ;[file] = await picker.pickFiles(false)
      if (!file) {
        return
      }
      refuseOversize(file, picker.maxBytes)
      setUploadingTerminal(true)
      const uploaded = await uploadAttachmentFile({
        client,
        worktreeId,
        file,
        getConnectionId: argsRef.current.getActiveWorktreeConnectionId
      })
      const sent = await writeAttachmentToTerminal({
        client,
        terminal: handle,
        agent: argsRef.current.agent,
        deviceToken: argsRef.current.deviceTokenRef.current,
        path: uploaded.path,
        fileName: uploaded.fileName,
        beforeTerminalSend: terminal.beforeSend
      })
      if (sent) {
        argsRef.current.onSuccess()
      }
    } catch (error) {
      reportFailure(error)
    } finally {
      setUploadingTerminal(false)
      await file?.release()
    }
  }, [picker, reportFailure])

  const attachFileToChat = useCallback(async (): Promise<void> => {
    const { client, chat, worktreeId } = argsRef.current
    const scope = chat.scopeKey
    if (!client || !scope || !chat.enabled) {
      return
    }
    // Captured now: the draft and chip scope stay the chat the user attached from.
    const { addUploadedImages, setComposerText } = chat
    let files: readonly PickedAttachmentFile[] = []
    // A chip renders from the picker's copy, so only those outlive the attach; the rest go as soon
    // as they are delivered, or when the attach fails.
    const previewedByChip = new Set<PickedAttachmentFile>()
    try {
      files = await picker.pickFiles(true)
      for (const file of files) {
        refuseOversize(file, picker.maxBytes)
      }
      if (files.length > 0) {
        setUploadingChat(true)
      }
      for (const file of files) {
        const uploaded = await uploadAttachmentFile({
          client,
          worktreeId,
          file,
          getConnectionId: argsRef.current.getActiveWorktreeConnectionId,
          keepInlineImage: file.previewUri === undefined
        })
        const image = chatImageFor(file, uploaded)
        if (image) {
          addUploadedImages(scope, [image])
          if (image.previewUri === file.previewUri) {
            previewedByChip.add(file)
          }
        } else {
          setComposerText((draft) => appendFileAttachmentPathToDraft(draft, uploaded.path))
        }
        if (!previewedByChip.has(file)) {
          await file.release()
        }
      }
      if (files.length > 0) {
        argsRef.current.onSuccess()
      }
    } catch (error) {
      reportFailure(error)
    } finally {
      setUploadingChat(false)
      for (const file of files) {
        if (!previewedByChip.has(file)) {
          await file.release()
        }
      }
    }
  }, [picker, reportFailure])

  // Read when the deferred choice runs, after the sheet has closed and cleared its own state.
  const sheetTargetRef = useRef<SheetTarget | null>(null)
  const openSheet = useCallback((target: SheetTarget) => {
    sheetTargetRef.current = target
    setSheetTarget(target)
  }, [])
  const choose = useCallback(
    (source: 'photo' | 'file') => {
      const target = sheetTargetRef.current
      const { terminal, chat } = argsRef.current
      if (target === null) {
        return
      }
      if (source === 'photo') {
        ;(target === 'terminal' ? terminal.attachPhoto : chat.attachPhoto)()
        return
      }
      void (target === 'terminal' ? attachFileToTerminal() : attachFileToChat())
    },
    [attachFileToChat, attachFileToTerminal]
  )

  const openTerminalSheet = useCallback(() => openSheet('terminal'), [openSheet])
  const openChatSheet = useCallback(() => openSheet('chat'), [openSheet])
  const attachTerminalFile = useCallback(() => void attachFileToTerminal(), [attachFileToTerminal])
  const onPhoto = useCallback(() => choose('photo'), [choose])
  const onFile = useCallback(() => choose('file'), [choose])
  const onClose = useCallback(() => setSheetTarget(null), [])

  return {
    openTerminalSheet,
    openChatSheet,
    attachFileToTerminal: attachTerminalFile,
    isUploadingToTerminal: uploadingTerminal,
    isUploadingToChat: uploadingChat,
    sheet: { visible: sheetTarget !== null, onPhoto, onFile, onClose }
  }
}
