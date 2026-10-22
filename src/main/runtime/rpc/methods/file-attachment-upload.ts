import { defineMethod, type RpcContext } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'
import {
  AbortFileAttachmentUpload,
  AppendFileAttachmentUploadChunk,
  CommitFileAttachmentUpload,
  StartFileAttachmentUpload
} from '../../../../shared/file-attachment-upload/file-attachment-upload-params'
import { FILE_ATTACHMENT_HOST_UNAVAILABLE_ERROR } from '../../../../shared/file-attachment-upload/file-attachment-upload-limits'
import { FileAttachmentUploadStore } from '../../../file-attachment-upload/file-attachment-upload-store'
import {
  createLocalFileAttachmentTarget,
  type FileAttachmentUploadTarget
} from '../../../file-attachment-upload/file-attachment-upload-target'

export type FileAttachmentUploadMethodDeps = {
  readonly store: FileAttachmentUploadStore
  readonly localTarget: () => FileAttachmentUploadTarget
}

type WorkspaceScopeRuntime = Pick<OrcaRuntimeService, 'showTerminalWorkspaceLaunchScope'>

function uploadOwnerId(ctx: RpcContext): string | undefined {
  if (ctx.clientKind !== 'mobile') {
    return undefined
  }
  const clientId = ctx.clientId?.trim()
  if (!clientId) {
    throw new Error('File upload requires an authenticated mobile client')
  }
  return clientId
}

/**
 * The machine the bytes go to is the one the workspace's terminals run on, decided by the same
 * resolver a PTY launch uses, so an agent in that terminal can read the path it is handed.
 */
export function createFileAttachmentUploadMethods(deps: FileAttachmentUploadMethodDeps) {
  async function resolveTarget(
    runtime: WorkspaceScopeRuntime,
    worktree: string
  ): Promise<FileAttachmentUploadTarget> {
    const scope = await runtime.showTerminalWorkspaceLaunchScope(worktree)
    const connectionId = scope.connectionId
    if (!connectionId) {
      return deps.localTarget()
    }
    // A remote client uploads through its owning orcad; legacy nested SSH is never local.
    throw new Error(FILE_ATTACHMENT_HOST_UNAVAILABLE_ERROR)
  }

  return [
    defineMethod({
      permission: 'workspace',
      name: 'fileAttachment.startUpload',
      params: StartFileAttachmentUpload,
      handler: async (params, ctx) => {
        const ownerId = uploadOwnerId(ctx)
        const target = await resolveTarget(ctx.runtime, params.worktree)
        return deps.store.start({
          ownerId,
          target,
          fileName: params.fileName,
          byteLength: params.byteLength,
          mimeType: params.mimeType
        })
      }
    }),
    defineMethod({
      permission: 'workspace',
      name: 'fileAttachment.appendUploadChunk',
      params: AppendFileAttachmentUploadChunk,
      handler: (params, ctx) =>
        deps.store.append(params.uploadId, uploadOwnerId(ctx), params.offset, params.contentBase64)
    }),
    defineMethod({
      permission: 'workspace',
      name: 'fileAttachment.commitUpload',
      params: CommitFileAttachmentUpload,
      handler: (params, ctx) => deps.store.commit(params.uploadId, uploadOwnerId(ctx))
    }),
    defineMethod({
      permission: 'workspace',
      name: 'fileAttachment.abortUpload',
      params: AbortFileAttachmentUpload,
      handler: (params, ctx) => deps.store.abort(params.uploadId, uploadOwnerId(ctx))
    })
  ]
}

let localTarget: FileAttachmentUploadTarget | null = null

export const FILE_ATTACHMENT_UPLOAD_METHODS = createFileAttachmentUploadMethods({
  store: new FileAttachmentUploadStore(),
  // Lazy: the app environment's temp path is not readable until the process has started.
  localTarget: () => (localTarget ??= createLocalFileAttachmentTarget())
})
