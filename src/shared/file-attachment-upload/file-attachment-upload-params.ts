import { z } from 'zod'
import { isValidRuntimeFileBase64 } from '../rpc-contract/files-mutation-params'
import {
  FILE_ATTACHMENT_CHUNK_BASE64_CHARS,
  FILE_ATTACHMENT_MAX_BYTES,
  FILE_ATTACHMENT_TOO_LARGE_ERROR
} from './file-attachment-upload-limits'

const FILE_NAME_INPUT_MAX_CHARS = 1024
const MIME_TYPE_MAX_CHARS = 128

const uploadId = z.string().min(1).max(128)

export const StartFileAttachmentUpload = z.object({
  worktree: z.string().min(1),
  fileName: z.string().max(FILE_NAME_INPUT_MAX_CHARS),
  byteLength: z
    .number()
    .int()
    .nonnegative()
    .max(FILE_ATTACHMENT_MAX_BYTES, FILE_ATTACHMENT_TOO_LARGE_ERROR),
  mimeType: z.string().max(MIME_TYPE_MAX_CHARS).optional()
})

export const AppendFileAttachmentUploadChunk = z.object({
  uploadId,
  /** Decoded bytes the host has already accepted; a resend of an old chunk is refused. */
  offset: z.number().int().nonnegative(),
  contentBase64: z
    .string()
    .max(FILE_ATTACHMENT_CHUNK_BASE64_CHARS, 'File upload chunk is too large')
    .refine(isValidRuntimeFileBase64, 'File upload chunk must be base64')
})

export const CommitFileAttachmentUpload = z.object({ uploadId })

export const AbortFileAttachmentUpload = z.object({ uploadId })

export type StartFileAttachmentUploadParams = z.infer<typeof StartFileAttachmentUpload>
