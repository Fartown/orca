import { defineMethod, type RpcContext } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'
import {
  AbortFileAttachmentUpload,
  AppendFileAttachmentUploadChunk,
  CommitFileAttachmentUpload,
  StartFileAttachmentUpload
} from '../../../../shared/file-attachment-upload/file-attachment-upload-params'
import { FILE_ATTACHMENT_HOST_UNAVAILABLE_ERROR } from '../../../../shared/file-attachment-upload/file-attachment-upload-limits'
import { getSshFilesystemProvider } from '../../../providers/ssh-filesystem-dispatch'
import { shellEscape } from '../../../ssh/ssh-connection-utils'
import { execCommand } from '../../../ssh/ssh-relay-exec-command'
import { getSshConnectionManager } from '../../../ssh/ssh-target-registry'
import { FileAttachmentUploadStore } from '../../../file-attachment-upload/file-attachment-upload-store'
import {
  createLocalFileAttachmentTarget,
  createSshFileAttachmentTarget,
  type FileAttachmentSshFilesystem,
  type FileAttachmentUploadTarget
} from '../../../file-attachment-upload/file-attachment-upload-target'

export type FileAttachmentUploadMethodDeps = {
  readonly store: FileAttachmentUploadStore
  readonly localTarget: () => FileAttachmentUploadTarget
  readonly sshProvider: (connectionId: string) => FileAttachmentSshFilesystem | undefined
  /** Runs `chmod 700` on the SSH host; only a shell there can set a mode. */
  readonly restrictSshRoot: (connectionId: string, root: string) => Promise<void>
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
  // Keyed on the provider: a reconnect builds a new one, and with it a fresh root and buffers.
  const sshTargets = new WeakMap<FileAttachmentSshFilesystem, FileAttachmentUploadTarget>()

  async function resolveTarget(
    runtime: WorkspaceScopeRuntime,
    worktree: string
  ): Promise<FileAttachmentUploadTarget> {
    const scope = await runtime.showTerminalWorkspaceLaunchScope(worktree)
    const connectionId = scope.connectionId
    if (!connectionId) {
      return deps.localTarget()
    }
    // Out of contact is a refusal, never a reconnect from here.
    const provider = deps.sshProvider(connectionId)
    if (!provider) {
      throw new Error(FILE_ATTACHMENT_HOST_UNAVAILABLE_ERROR)
    }
    let target = sshTargets.get(provider)
    if (!target) {
      target = createSshFileAttachmentTarget(connectionId, provider, {
        restrictRoot: (root) => deps.restrictSshRoot(connectionId, root)
      })
      sshTargets.set(provider, target)
    }
    return target
  }

  return [
    defineMethod({
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
      name: 'fileAttachment.appendUploadChunk',
      params: AppendFileAttachmentUploadChunk,
      handler: (params, ctx) =>
        deps.store.append(params.uploadId, uploadOwnerId(ctx), params.offset, params.contentBase64)
    }),
    defineMethod({
      name: 'fileAttachment.commitUpload',
      params: CommitFileAttachmentUpload,
      handler: (params, ctx) => deps.store.commit(params.uploadId, uploadOwnerId(ctx))
    }),
    defineMethod({
      name: 'fileAttachment.abortUpload',
      params: AbortFileAttachmentUpload,
      handler: (params, ctx) => deps.store.abort(params.uploadId, uploadOwnerId(ctx))
    })
  ]
}

let localTarget: FileAttachmentUploadTarget | null = null

async function restrictSshRootOverShell(connectionId: string, root: string): Promise<void> {
  const connection = getSshConnectionManager()?.getConnection(connectionId)
  if (!connection) {
    throw new Error(FILE_ATTACHMENT_HOST_UNAVAILABLE_ERROR)
  }
  await execCommand(connection, `chmod 700 ${shellEscape(root)}`)
}

export const FILE_ATTACHMENT_UPLOAD_METHODS = createFileAttachmentUploadMethods({
  store: new FileAttachmentUploadStore(),
  // Lazy: the app environment's temp path is not readable until the process has started.
  localTarget: () => (localTarget ??= createLocalFileAttachmentTarget()),
  sshProvider: getSshFilesystemProvider,
  restrictSshRoot: restrictSshRootOverShell
})
