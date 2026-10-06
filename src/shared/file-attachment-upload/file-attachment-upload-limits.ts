// Constants and reply shapes only: mobile imports this module, and it must not pull zod in with it.

/** The largest file one upload may carry, decoded. */
export const FILE_ATTACHMENT_MAX_BYTES = 100 * 1024 * 1024

/** Same chunk as the clipboard image upload, so no frame grows past what mobile already sends. */
export const FILE_ATTACHMENT_CHUNK_BASE64_CHARS = 512 * 1024

/** Raw bytes per chunk: whole base64 quartets, so every chunk but the last decodes unpadded. */
export const FILE_ATTACHMENT_CHUNK_BYTES = (FILE_ATTACHMENT_CHUNK_BASE64_CHARS / 4) * 3

export const FILE_ATTACHMENT_TOO_LARGE_ERROR = 'File is too large to attach'
export const FILE_ATTACHMENT_HOST_UNAVAILABLE_ERROR = 'The workspace host is not connected'

export type StartFileAttachmentUploadResult = {
  uploadId: string
  maxChunkBase64Chars: number
}

export type AppendFileAttachmentUploadChunkResult = { receivedBytes: number }

/** `path` is absolute on the machine that holds the workspace, which may not be this one. */
export type CommitFileAttachmentUploadResult = {
  path: string
  fileName: string
  byteLength: number
}

export type AbortFileAttachmentUploadResult = { aborted: boolean }
