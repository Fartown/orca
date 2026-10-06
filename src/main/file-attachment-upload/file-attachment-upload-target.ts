import { appendFile, mkdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getAppEnvironment } from '../../shared/app-environment'
import { isWindowsAbsolutePathLike } from '../../shared/cross-platform-path'
import type { IFilesystemProvider } from '../providers/types'
import {
  ensureOwnedTempStagingRoot,
  getOwnedTempStagingRoot,
  isDirectChild,
  removeOwnedDirectory,
  sweepExpiredOwnedDirectories
} from '../window/owned-temp-staging-root'

const ROOT_NAME = 'orca-file-attachments'
// Under the remote user's home, not the shared temp dir: the filesystem calls cannot chmod, and on a
// multi-user Linux host `/tmp` would leave every upload readable by other accounts.
const REMOTE_ROOT = '~/.orca-remote/file-attachments'
const PART_SUFFIX = '.part'

// `{epoch ms}-{uuid}`: the name carries its own age, so a remote sweep needs no stat per entry.
const UPLOAD_DIRECTORY_NAME =
  /^(\d{13})-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export function fileAttachmentUploadDirectoryName(nowMs: number, uuid: string): string {
  return `${String(nowMs).padStart(13, '0')}-${uuid}`
}

function uploadDirectoryCreatedAt(name: string): number | null {
  const match = UPLOAD_DIRECTORY_NAME.exec(name)
  return match ? Number(match[1]) : null
}

export type FileAttachmentUploadPaths = {
  directory: string
  partPath: string
  finalPath: string
}

/** Where one upload's bytes land: the machine that holds the workspace. */
export type FileAttachmentUploadTarget = {
  /** One key per machine, so sweeps are throttled per host rather than per upload. */
  readonly hostKey: string
  prepare(directoryName: string, fileName: string): Promise<FileAttachmentUploadPaths>
  append(partPath: string, contentBase64: string): Promise<void>
  finalize(paths: FileAttachmentUploadPaths): Promise<void>
  remove(paths: FileAttachmentUploadPaths): Promise<void>
  sweepExpired(nowMs: number, ttlMs: number): Promise<void>
}

export function createLocalFileAttachmentTarget(
  tempRoot: string = getAppEnvironment().getPath('temp')
): FileAttachmentUploadTarget {
  const root = getOwnedTempStagingRoot(tempRoot, ROOT_NAME)
  return {
    hostKey: 'local',
    async prepare(directoryName, fileName) {
      if (!(await ensureOwnedTempStagingRoot(root))) {
        throw new Error('The file attachment directory is not private to this user')
      }
      const directory = path.join(root, directoryName)
      await mkdir(directory, { mode: 0o700 })
      const paths = {
        directory,
        partPath: path.join(directory, `${fileName}${PART_SUFFIX}`),
        finalPath: path.join(directory, fileName)
      }
      await writeFile(paths.partPath, '', { flag: 'wx' })
      return paths
    },
    async append(partPath, contentBase64) {
      await appendFile(partPath, Buffer.from(contentBase64, 'base64'))
    },
    async finalize(paths) {
      await rename(paths.partPath, paths.finalPath)
    },
    async remove(paths) {
      // Never follow a directory the store did not mint under this root.
      if (isDirectChild(root, paths.directory)) {
        await removeOwnedDirectory(paths.directory)
      }
    },
    async sweepExpired(nowMs, ttlMs) {
      await sweepExpiredOwnedDirectories(root, {
        nowMs,
        ttlMs,
        ownsEntry: (name) => uploadDirectoryCreatedAt(name) !== null
      })
    }
  }
}

/** The remote filesystem calls an upload makes; nothing else of the provider is reachable from here. */
export type FileAttachmentSshFilesystem = Pick<
  IFilesystemProvider,
  | 'realpath'
  | 'createDir'
  | 'createDirNoClobber'
  | 'writeFileBase64Chunk'
  | 'rename'
  | 'deletePath'
  | 'readDir'
>

/**
 * Chunks are held here until this many bytes, then written in one remote call: each write opens its
 * own SFTP channel, or spawns `ssh` on the system transport, so a 100 MiB file sent at chunk size
 * would pay for that some 270 times.
 */
export const SSH_FILE_ATTACHMENT_FLUSH_BYTES = 4 * 1024 * 1024

export type SshFileAttachmentTargetOptions = {
  /** Makes the upload root private on a POSIX host; the filesystem calls cannot set modes. */
  readonly restrictRoot: (root: string) => Promise<void>
}

export function createSshFileAttachmentTarget(
  connectionId: string,
  provider: FileAttachmentSshFilesystem,
  options: SshFileAttachmentTargetOptions
): FileAttachmentUploadTarget {
  let rootPromise: Promise<{ root: string; join: (...parts: string[]) => string }> | null = null
  const pending = new Map<string, Buffer[]>()

  const resolveRoot = () => {
    rootPromise ??= (async () => {
      // The relay expands `~`; realpath answers the absolute path an agent on that host can open.
      await provider.createDir(REMOTE_ROOT)
      const root = await provider.realpath(REMOTE_ROOT)
      // Path rules follow the remote host, not this client: a Windows client may drive Linux.
      const windows = isWindowsAbsolutePathLike(root)
      if (!windows) {
        // A 0755 home would otherwise let other accounts read every upload under it.
        await options.restrictRoot(root)
      }
      return { root, join: windows ? path.win32.join : path.posix.join }
    })().catch((error: unknown) => {
      rootPromise = null
      throw error
    })
    return rootPromise
  }

  const createUploadDirectory = async (directoryName: string) => {
    const { root, join } = await resolveRoot()
    const directory = join(root, directoryName)
    await provider.createDirNoClobber(directory)
    return { directory, join }
  }

  const flush = async (partPath: string) => {
    const buffers = pending.get(partPath)
    if (!buffers || buffers.length === 0) {
      return
    }
    pending.set(partPath, [])
    await provider.writeFileBase64Chunk(partPath, Buffer.concat(buffers).toString('base64'), true)
  }

  return {
    hostKey: `ssh:${connectionId}`,
    async prepare(directoryName, fileName) {
      let created: Awaited<ReturnType<typeof createUploadDirectory>>
      try {
        created = await createUploadDirectory(directoryName)
      } catch {
        // The root may have been removed since it was resolved; resolve it again once.
        rootPromise = null
        created = await createUploadDirectory(directoryName)
      }
      const { directory, join } = created
      const paths = {
        directory,
        partPath: join(directory, `${fileName}${PART_SUFFIX}`),
        finalPath: join(directory, fileName)
      }
      await provider.writeFileBase64Chunk(paths.partPath, '', false)
      pending.set(paths.partPath, [])
      return paths
    },
    async append(partPath, contentBase64) {
      const buffers = pending.get(partPath) ?? []
      buffers.push(Buffer.from(contentBase64, 'base64'))
      pending.set(partPath, buffers)
      if (
        buffers.reduce((total, buffer) => total + buffer.byteLength, 0) >=
        SSH_FILE_ATTACHMENT_FLUSH_BYTES
      ) {
        await flush(partPath)
      }
    },
    async finalize(paths) {
      await flush(paths.partPath)
      pending.delete(paths.partPath)
      await provider.rename(paths.partPath, paths.finalPath)
    },
    async remove(paths) {
      pending.delete(paths.partPath)
      await provider.deletePath(paths.directory, true)
    },
    async sweepExpired(nowMs, ttlMs) {
      const { root, join } = await resolveRoot()
      let entries: Awaited<ReturnType<FileAttachmentSshFilesystem['readDir']>>
      try {
        entries = await provider.readDir(root)
      } catch {
        return
      }
      for (const entry of entries) {
        const createdAt = entry.isDirectory ? uploadDirectoryCreatedAt(entry.name) : null
        if (createdAt !== null && nowMs - createdAt >= ttlMs) {
          await provider.deletePath(join(root, entry.name), true).catch(() => undefined)
        }
      }
    }
  }
}
