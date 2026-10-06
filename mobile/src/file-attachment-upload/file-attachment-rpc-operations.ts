import { z } from 'zod'
import { bindDeferredRpcOperation, defineRpcOperation } from '../transport/rpc-operation'
import { rpcResultVariant } from '../transport/rpc-operation-result-reader'

// Replies checked against src/main/file-attachment-upload/file-attachment-upload-store.ts. Each is
// loose so a later host may add members; only what this side reads is required.

const uploadSlotSchema = z.looseObject({ uploadId: z.string().min(1) })
const chunkAcceptedSchema = z.looseObject({ receivedBytes: z.number().int().nonnegative() })
const committedFileSchema = z.looseObject({
  path: z.string().min(1),
  fileName: z.string().min(1),
  byteLength: z.number().int().nonnegative()
})

/**
 * Opening a slot. Its refusal is read raw before interpretation: an older host answers
 * `forbidden` or `method_not_found`, which is "update the computer", not a failed upload.
 */
export const fileAttachmentUploadStart = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'file-attachment.start-upload',
    method: 'fileAttachment.startUpload',
    acceptance: 'require-result-or-throw-message',
    barrier: 'after-caller-barrier',
    read: rpcResultVariant('file-attachment-upload-slot', uploadSlotSchema)
  })
)

export const fileAttachmentUploadAppend = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'file-attachment.append-upload-chunk',
    method: 'fileAttachment.appendUploadChunk',
    acceptance: 'require-result-or-throw-message',
    barrier: 'after-caller-barrier',
    read: rpcResultVariant('file-attachment-chunk-accepted', chunkAcceptedSchema)
  })
)

export const fileAttachmentUploadCommit = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'file-attachment.commit-upload',
    method: 'fileAttachment.commitUpload',
    acceptance: 'require-result-or-throw-message',
    barrier: 'after-caller-barrier',
    read: rpcResultVariant('file-attachment-committed', committedFileSchema)
  })
)

/** Releasing what a failed upload left. Its outcome is never read: the failure is the news. */
export const fileAttachmentUploadAbort = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'file-attachment.abort-upload',
    method: 'fileAttachment.abortUpload',
    acceptance: 'require-result-or-throw-message',
    barrier: 'after-caller-barrier',
    read: rpcResultVariant('file-attachment-aborted', z.looseObject({}))
  })
)
