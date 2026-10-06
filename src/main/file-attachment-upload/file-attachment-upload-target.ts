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
const REMOTE_FALLBACK_TEMP_DIR = '/tmp'
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
  | 'getTempDir'
  | 'createDir'
  | 'createDirNoClobber'
  | 'writeFileBase64Chunk'
  | 'rename'
  | 'deletePath'
  | 'readDir'
>

export function createSshFileAttachmentTarget(
  connectionId: string,
  provider: FileAttachmentSshFilesystem
): FileAttachmentUploadTarget {
  let rootPromise: Promise<{ root: string; join: (...parts: string[]) => string }> | null = null
  const resolveRoot = () => {
    rootPromise ??= (async () => {
      const tempDir = (await provider.getTempDir?.()) ?? REMOTE_FALLBACK_TEMP_DIR
      // Path rules follow the remote host, not this client: a Windows client may drive Linux.
      const pathApi = isWindowsAbsolutePathLike(tempDir) ? path.win32 : path.posix
      return { root: pathApi.join(tempDir, ROOT_NAME), join: pathApi.join }
    })().catch((error: unknown) => {
      rootPromise = null
      throw error
    })
    return rootPromise
  }
  return {
    hostKey: `ssh:${connectionId}`,
    async prepare(directoryName, fileName) {
      const { root, join } = await resolveRoot()
      await provider.createDir(root)
      const directory = join(root, directoryName)
      await provider.createDirNoClobber(directory)
      const paths = {
        directory,
        partPath: join(directory, `${fileName}${PART_SUFFIX}`),
        finalPath: join(directory, fileName)
      }
      await provider.writeFileBase64Chunk(paths.partPath, '', false)
      return paths
    },
    async append(partPath, contentBase64) {
      await provider.writeFileBase64Chunk(partPath, contentBase64, true)
    },
    async finalize(paths) {
      await provider.rename(paths.partPath, paths.finalPath)
    },
    async remove(paths) {
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
