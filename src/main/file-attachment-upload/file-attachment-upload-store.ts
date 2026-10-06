import { randomUUID } from 'node:crypto'
import { sanitizeFileAttachmentName } from '../../shared/file-attachment-upload/file-attachment-file-name'
import {
  FILE_ATTACHMENT_CHUNK_BASE64_CHARS,
  type AbortFileAttachmentUploadResult,
  type AppendFileAttachmentUploadChunkResult,
  type CommitFileAttachmentUploadResult,
  type StartFileAttachmentUploadResult
} from '../../shared/file-attachment-upload/file-attachment-upload-limits'
import {
  fileAttachmentUploadDirectoryName,
  type FileAttachmentUploadPaths,
  type FileAttachmentUploadTarget
} from './file-attachment-upload-target'

/** Per client, so one phone that dropped mid-upload cannot lock every other client out. */
export const FILE_ATTACHMENT_UPLOAD_MAX_CONCURRENT_PER_CLIENT = 4
export const FILE_ATTACHMENT_UPLOAD_MAX_CONCURRENT = 16
export const FILE_ATTACHMENT_UPLOAD_IDLE_TTL_MS = 5 * 60 * 1000
export const FILE_ATTACHMENT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const SWEEP_INTERVAL_MS = 60 * 60 * 1000

const UPLOAD_NOT_FOUND = 'File upload was not found'

type Upload = {
  readonly ownerId: string | undefined
  readonly target: FileAttachmentUploadTarget
  readonly paths: FileAttachmentUploadPaths
  readonly fileName: string
  readonly byteLength: number
  receivedBytes: number
  /** Serializes this upload's writes so a resent chunk cannot interleave with the one before it. */
  queue: Promise<unknown>
  idleTimer: ReturnType<typeof setTimeout>
}

export type FileAttachmentUploadStoreDeps = {
  readonly now?: () => number
  readonly newId?: () => string
  readonly onBackgroundError?: (message: string, error: unknown) => void
}

export type StartFileAttachmentUploadInput = {
  readonly ownerId: string | undefined
  readonly target: FileAttachmentUploadTarget
  readonly fileName: string
  readonly byteLength: number
  readonly mimeType?: string
}

/**
 * Upload slots for files streamed from a paired client to the workspace host's temp directory.
 *
 * Only the slot lives here; every byte goes straight to the target, so a 100 MiB upload never
 * exists in this process's memory as a whole.
 */
export class FileAttachmentUploadStore {
  private readonly uploads = new Map<string, Upload>()
  private readonly lastSweepByHost = new Map<string, number>()
  private readonly now: () => number
  private readonly newId: () => string
  private readonly onBackgroundError: (message: string, error: unknown) => void

  constructor(deps: FileAttachmentUploadStoreDeps = {}) {
    this.now = deps.now ?? Date.now
    this.newId = deps.newId ?? randomUUID
    this.onBackgroundError =
      deps.onBackgroundError ??
      ((message, error) => console.warn(`[file-attachment-upload] ${message}`, error))
  }

  async start(input: StartFileAttachmentUploadInput): Promise<StartFileAttachmentUploadResult> {
    this.refuseOverCapacity(input.ownerId)
    this.sweepInBackground(input.target)
    const fileName = sanitizeFileAttachmentName(input.fileName, input.mimeType)
    const uploadId = this.newId()
    const paths = await input.target.prepare(
      fileAttachmentUploadDirectoryName(this.now(), this.newId()),
      fileName
    )
    // A concurrent start may have filled the last slot while this one was creating its directory.
    try {
      this.refuseOverCapacity(input.ownerId)
    } catch (error) {
      await this.removeQuietly(input.target, paths)
      throw error
    }
    this.uploads.set(uploadId, {
      ownerId: input.ownerId,
      target: input.target,
      paths,
      fileName,
      byteLength: input.byteLength,
      receivedBytes: 0,
      queue: Promise.resolve(),
      idleTimer: this.scheduleIdleExpiry(uploadId)
    })
    return { uploadId, maxChunkBase64Chars: FILE_ATTACHMENT_CHUNK_BASE64_CHARS }
  }

  append(
    uploadId: string,
    ownerId: string | undefined,
    offset: number,
    contentBase64: string
  ): Promise<AppendFileAttachmentUploadChunkResult> {
    const upload = this.requireOwned(uploadId, ownerId)
    return this.enqueue(uploadId, upload, async () => {
      if (offset !== upload.receivedBytes) {
        throw new Error('File upload chunk offset is out of order')
      }
      const chunkBytes = Buffer.byteLength(contentBase64, 'base64')
      if (upload.receivedBytes + chunkBytes > upload.byteLength) {
        throw new Error('File upload exceeded its declared size')
      }
      await upload.target.append(upload.paths.partPath, contentBase64)
      upload.receivedBytes += chunkBytes
      return { receivedBytes: upload.receivedBytes }
    })
  }

  commit(uploadId: string, ownerId: string | undefined): Promise<CommitFileAttachmentUploadResult> {
    const upload = this.requireOwned(uploadId, ownerId)
    return this.enqueue(uploadId, upload, async () => {
      if (upload.receivedBytes !== upload.byteLength) {
        throw new Error('File upload is incomplete')
      }
      this.forget(uploadId)
      try {
        await upload.target.finalize(upload.paths)
      } catch (error) {
        await this.removeQuietly(upload.target, upload.paths)
        throw error
      }
      return {
        path: upload.paths.finalPath,
        fileName: upload.fileName,
        byteLength: upload.byteLength
      }
    })
  }

  async abort(
    uploadId: string,
    ownerId: string | undefined
  ): Promise<AbortFileAttachmentUploadResult> {
    const upload = this.uploads.get(uploadId)
    if (!upload || upload.ownerId !== ownerId) {
      return { aborted: false }
    }
    this.forget(uploadId)
    // Behind any write still in flight, so the directory is not recreated by a late append.
    await upload.queue.catch(() => undefined)
    await this.removeQuietly(upload.target, upload.paths)
    return { aborted: true }
  }

  activeCount(): number {
    return this.uploads.size
  }

  resetForTest(): void {
    for (const upload of this.uploads.values()) {
      clearTimeout(upload.idleTimer)
    }
    this.uploads.clear()
    this.lastSweepByHost.clear()
  }

  private refuseOverCapacity(ownerId: string | undefined): void {
    let owned = 0
    for (const upload of this.uploads.values()) {
      owned += upload.ownerId === ownerId ? 1 : 0
    }
    if (
      owned >= FILE_ATTACHMENT_UPLOAD_MAX_CONCURRENT_PER_CLIENT ||
      this.uploads.size >= FILE_ATTACHMENT_UPLOAD_MAX_CONCURRENT
    ) {
      throw new Error('Too many file uploads are in progress')
    }
  }

  private requireOwned(uploadId: string, ownerId: string | undefined): Upload {
    const upload = this.uploads.get(uploadId)
    // Another client's slot answers exactly like a missing one: its id is not a capability.
    if (!upload || upload.ownerId !== ownerId) {
      throw new Error(UPLOAD_NOT_FOUND)
    }
    return upload
  }

  private enqueue<T>(uploadId: string, upload: Upload, operation: () => Promise<T>): Promise<T> {
    const run = upload.queue.then(() => {
      if (this.uploads.get(uploadId) !== upload) {
        throw new Error(UPLOAD_NOT_FOUND)
      }
      clearTimeout(upload.idleTimer)
      upload.idleTimer = this.scheduleIdleExpiry(uploadId)
      return operation()
    })
    upload.queue = run.catch(() => undefined)
    return run
  }

  private forget(uploadId: string): void {
    const upload = this.uploads.get(uploadId)
    if (upload) {
      clearTimeout(upload.idleTimer)
      this.uploads.delete(uploadId)
    }
  }

  private scheduleIdleExpiry(uploadId: string): ReturnType<typeof setTimeout> {
    const timer = setTimeout(() => {
      const upload = this.uploads.get(uploadId)
      if (!upload) {
        return
      }
      this.uploads.delete(uploadId)
      void upload.queue.then(() => this.removeQuietly(upload.target, upload.paths))
    }, FILE_ATTACHMENT_UPLOAD_IDLE_TTL_MS)
    timer.unref?.()
    return timer
  }

  private async removeQuietly(
    target: FileAttachmentUploadTarget,
    paths: FileAttachmentUploadPaths
  ): Promise<void> {
    try {
      await target.remove(paths)
    } catch (error) {
      // The retention sweep on the next upload to this host removes what is left.
      this.onBackgroundError('could not remove an unfinished upload', error)
    }
  }

  private sweepInBackground(target: FileAttachmentUploadTarget): void {
    const now = this.now()
    const last = this.lastSweepByHost.get(target.hostKey)
    if (last !== undefined && now - last < SWEEP_INTERVAL_MS) {
      return
    }
    this.lastSweepByHost.set(target.hostKey, now)
    void target.sweepExpired(now, FILE_ATTACHMENT_RETENTION_MS).catch((error: unknown) => {
      this.onBackgroundError('could not sweep expired uploads', error)
    })
  }
}
