import { CLIPBOARD_IMAGE_MAX_SOURCE_BYTES } from '../../../src/shared/clipboard-image'
import { isAgentImageAttachmentName } from '../../../src/shared/file-attachment-upload/file-attachment-delivery-text'
import {
  FILE_ATTACHMENT_CHUNK_BYTES,
  FILE_ATTACHMENT_MAX_BYTES
} from '../../../src/shared/file-attachment-upload/file-attachment-upload-limits'
import { isMobileMethodUnavailableError } from '../files/file-list-fallback'
import { base64DecodedByteLength } from './attachment-base64-length'
import { saveMobileClipboardImageAsTempFile } from '../session/mobile-clipboard-image'
import {
  fileAttachmentUploadAbort,
  fileAttachmentUploadAppend,
  fileAttachmentUploadCommit,
  fileAttachmentUploadStart
} from './file-attachment-rpc-operations'
import {
  FileAttachmentHostUpdateRequiredError,
  FileAttachmentTooLargeError,
  type PickedAttachmentFile
} from './picked-attachment-file'

export type FileAttachmentRpcSender = Parameters<typeof fileAttachmentUploadStart.request>[0] &
  Parameters<typeof saveMobileClipboardImageAsTempFile>[0]

export type UploadedAttachmentFile = {
  /** Absolute on the machine that holds the workspace. */
  readonly path: string
  readonly fileName: string
  /** Base64 of the whole file, kept only for an image small enough to preview inline. */
  readonly inlineImageBase64?: string
}

export type UploadAttachmentFileArgs = {
  readonly client: FileAttachmentRpcSender
  readonly worktreeId: string
  readonly file: PickedAttachmentFile
  /** Only the old-host image fallback addresses a connection; the new path lets the host decide. */
  readonly getConnectionId: () => Promise<string | null>
  /** Keep the whole base64 for an image chip preview on a side with no renderable URI. */
  readonly keepInlineImage?: boolean
}

async function readWholeFileBase64(file: PickedAttachmentFile): Promise<string> {
  const chunks: string[] = []
  // Whole quartets in every chunk but the last, so joining them is still valid base64.
  for await (const chunk of file.readBase64Chunks(FILE_ATTACHMENT_CHUNK_BYTES)) {
    chunks.push(chunk)
  }
  return chunks.join('')
}

/** An older computer has no file upload; an image small enough still goes the way images always did. */
async function uploadThroughImageChannel(
  args: UploadAttachmentFileArgs
): Promise<UploadedAttachmentFile> {
  const { client, file } = args
  if (
    !isAgentImageAttachmentName(file.name) ||
    file.byteLength > CLIPBOARD_IMAGE_MAX_SOURCE_BYTES
  ) {
    throw new FileAttachmentHostUpdateRequiredError()
  }
  const base64 = await readWholeFileBase64(file)
  const path = await saveMobileClipboardImageAsTempFile(client, base64, {
    connectionId: await args.getConnectionId()
  })
  return {
    path,
    fileName: file.name,
    ...(args.keepInlineImage ? { inlineImageBase64: base64 } : {})
  }
}

/**
 * Streams one picked file to the host, which writes it into the workspace host's temp directory.
 * Any failure after the slot opens aborts it, so the host removes what it already wrote.
 */
export async function uploadAttachmentFile(
  args: UploadAttachmentFileArgs
): Promise<UploadedAttachmentFile> {
  const { client, file } = args
  if (file.byteLength > FILE_ATTACHMENT_MAX_BYTES) {
    throw new FileAttachmentTooLargeError(FILE_ATTACHMENT_MAX_BYTES)
  }
  const startResponse = await fileAttachmentUploadStart.request(client, {
    worktree: `id:${args.worktreeId}`,
    fileName: file.name,
    byteLength: file.byteLength,
    ...(file.mimeType ? { mimeType: file.mimeType } : {})
  })
  if (
    !startResponse.ok &&
    isMobileMethodUnavailableError(startResponse.error.code, startResponse.error.message)
  ) {
    return uploadThroughImageChannel(args)
  }
  const { uploadId } = fileAttachmentUploadStart.interpret(startResponse)
  // Bounded like any image the composer previews inline; a larger one rides as a file reference.
  const keepInline =
    args.keepInlineImage === true &&
    isAgentImageAttachmentName(file.name) &&
    file.byteLength <= CLIPBOARD_IMAGE_MAX_SOURCE_BYTES
  const inlineChunks: string[] = []
  try {
    let offset = 0
    for await (const contentBase64 of file.readBase64Chunks(FILE_ATTACHMENT_CHUNK_BYTES)) {
      fileAttachmentUploadAppend.interpret(
        await fileAttachmentUploadAppend.request(client, { uploadId, offset, contentBase64 })
      )
      offset += base64DecodedByteLength(contentBase64)
      if (keepInline) {
        inlineChunks.push(contentBase64)
      }
    }
    const committed = fileAttachmentUploadCommit.interpret(
      await fileAttachmentUploadCommit.request(client, { uploadId })
    )
    return {
      path: committed.path,
      fileName: committed.fileName,
      ...(keepInline ? { inlineImageBase64: inlineChunks.join('') } : {})
    }
  } catch (error) {
    await fileAttachmentUploadAbort.request(client, { uploadId }).catch(() => undefined)
    throw error
  }
}
