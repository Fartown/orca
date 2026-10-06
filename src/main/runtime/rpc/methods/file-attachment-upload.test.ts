import '../unused-default-rpc-methods.test-fixture'
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { RpcDispatcher } from '../dispatcher'
import type { RpcRequest, RpcResponse } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'
import {
  FILE_ATTACHMENT_CHUNK_BASE64_CHARS,
  FILE_ATTACHMENT_HOST_UNAVAILABLE_ERROR,
  FILE_ATTACHMENT_MAX_BYTES
} from '../../../../shared/file-attachment-upload/file-attachment-upload-limits'
import {
  FILE_ATTACHMENT_RETENTION_MS,
  FILE_ATTACHMENT_UPLOAD_IDLE_TTL_MS,
  FILE_ATTACHMENT_UPLOAD_MAX_CONCURRENT,
  FileAttachmentUploadStore
} from '../../../file-attachment-upload/file-attachment-upload-store'
import {
  createLocalFileAttachmentTarget,
  fileAttachmentUploadDirectoryName,
  type FileAttachmentSshFilesystem,
  type FileAttachmentUploadTarget
} from '../../../file-attachment-upload/file-attachment-upload-target'
import { createFileAttachmentUploadMethods } from './file-attachment-upload'

type FakeEntry = { kind: 'dir' } | { kind: 'file'; bytes: Buffer }

/** An SSH host's filesystem as the upload sees it: absolute paths, POSIX or Windows style. */
class FakeRemoteFilesystem implements FileAttachmentSshFilesystem {
  readonly entries = new Map<string, FakeEntry>()
  failWrites = false

  constructor(private readonly tempDir: string) {
    this.entries.set(tempDir, { kind: 'dir' })
  }

  async getTempDir(): Promise<string> {
    return this.tempDir
  }
  async createDir(dirPath: string): Promise<void> {
    this.entries.set(dirPath, { kind: 'dir' })
  }
  async createDirNoClobber(dirPath: string): Promise<void> {
    if (this.entries.has(dirPath)) {
      throw new Error('EEXIST')
    }
    this.entries.set(dirPath, { kind: 'dir' })
  }
  async writeFileBase64Chunk(filePath: string, contentBase64: string, append: boolean) {
    if (this.failWrites) {
      throw new Error('Remote connection dropped')
    }
    const bytes = Buffer.from(contentBase64, 'base64')
    const existing = this.entries.get(filePath)
    if (!append && existing) {
      throw new Error('EEXIST')
    }
    const previous = existing?.kind === 'file' ? existing.bytes : Buffer.alloc(0)
    this.entries.set(filePath, { kind: 'file', bytes: Buffer.concat([previous, bytes]) })
  }
  async rename(oldPath: string, newPath: string): Promise<void> {
    const entry = this.entries.get(oldPath)
    if (!entry) {
      throw new Error('ENOENT')
    }
    this.entries.delete(oldPath)
    this.entries.set(newPath, entry)
  }
  async deletePath(targetPath: string): Promise<void> {
    for (const key of this.entries.keys()) {
      if (
        key === targetPath ||
        key.startsWith(`${targetPath}/`) ||
        key.startsWith(`${targetPath}\\`)
      ) {
        this.entries.delete(key)
      }
    }
  }
  async readDir(dirPath: string) {
    const separator = dirPath.includes('\\') ? '\\' : '/'
    return [...this.entries.entries()]
      .filter(([key]) => key.startsWith(`${dirPath}${separator}`))
      .map(([key, entry]) => ({ rel: key.slice(dirPath.length + 1), entry }))
      .filter(({ rel }) => !rel.includes(separator))
      .map(({ rel, entry }) => ({ name: rel, isDirectory: entry.kind === 'dir', isSymlink: false }))
  }
  fileAt(filePath: string): Buffer | undefined {
    const entry = this.entries.get(filePath)
    return entry?.kind === 'file' ? entry.bytes : undefined
  }
}

const LOCAL_WORKTREE = 'id:local-worktree'
const SSH_WORKTREE = 'id:ssh-worktree'
const SSH_FOLDER_WORKSPACE = 'id:folder:ssh-folder'

let tempRoot: string
let remote: FakeRemoteFilesystem
let windowsRemote: FakeRemoteFilesystem
let store: FileAttachmentUploadStore
let dispatcher: RpcDispatcher
let localTarget: FileAttachmentUploadTarget
let connected: boolean

function workspaceScope(selector: string) {
  const connectionId =
    selector === SSH_WORKTREE || selector === SSH_FOLDER_WORKSPACE
      ? 'ssh-linux'
      : selector === 'id:windows-worktree'
        ? 'ssh-windows'
        : null
  return { id: selector, path: '/repo', connectionId, repo: null, folderWorkspace: null }
}

async function call(method: string, params: unknown, clientId = 'device-a'): Promise<RpcResponse> {
  const replies: RpcResponse[] = []
  const request: RpcRequest = { id: 'req-1', authToken: 'tok', method, params }
  await dispatcher.dispatchStreaming(request, (raw) => replies.push(JSON.parse(raw)), {
    clientKind: 'mobile',
    clientId
  })
  const reply = replies[0]
  if (!reply) {
    throw new Error(`no reply for ${method}`)
  }
  return reply
}

async function ok(method: string, params: unknown, clientId?: string): Promise<unknown> {
  const reply = await call(method, params, clientId)
  if (!reply.ok) {
    throw new Error(`${method} failed: ${reply.error.message}`)
  }
  return reply.result
}

const startedSchema = z.object({ uploadId: z.string() })
const committedSchema = z.object({ path: z.string(), fileName: z.string(), byteLength: z.number() })

async function start(params: unknown, clientId?: string): Promise<string> {
  return startedSchema.parse(await ok('fileAttachment.startUpload', params, clientId)).uploadId
}

async function failure(method: string, params: unknown, clientId?: string): Promise<string> {
  const reply = await call(method, params, clientId)
  if (reply.ok) {
    throw new Error(`${method} unexpectedly succeeded`)
  }
  return reply.error.message
}

async function upload(worktree: string, fileName: string, bytes: Buffer, clientId?: string) {
  const uploadId = await start({ worktree, fileName, byteLength: bytes.byteLength }, clientId)
  const chunkBytes = (FILE_ATTACHMENT_CHUNK_BASE64_CHARS / 4) * 3
  for (let offset = 0; offset < bytes.byteLength; offset += chunkBytes) {
    await ok(
      'fileAttachment.appendUploadChunk',
      {
        uploadId,
        offset,
        contentBase64: bytes.subarray(offset, offset + chunkBytes).toString('base64')
      },
      clientId
    )
  }
  return committedSchema.parse(await ok('fileAttachment.commitUpload', { uploadId }, clientId))
}

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(tmpdir(), 'orca-file-attachment-test-'))
  remote = new FakeRemoteFilesystem('/home/me/tmp')
  windowsRemote = new FakeRemoteFilesystem('C:\\Users\\me\\AppData\\Local\\Temp')
  connected = true
  store = new FileAttachmentUploadStore({ onBackgroundError: () => undefined })
  localTarget = createLocalFileAttachmentTarget(tempRoot)
  const runtime = {
    getRuntimeId: () => 'test-runtime',
    showTerminalWorkspaceLaunchScope: async (selector: string) => workspaceScope(selector)
  }
  dispatcher = new RpcDispatcher({
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: these methods read only `showTerminalWorkspaceLaunchScope`; the dispatcher reads only `getRuntimeId`.
    runtime: runtime as unknown as OrcaRuntimeService,
    methods: createFileAttachmentUploadMethods({
      store,
      localTarget: () => localTarget,
      sshProvider: (connectionId) =>
        !connected ? undefined : connectionId === 'ssh-windows' ? windowsRemote : remote
    })
  })
})

afterEach(async () => {
  vi.useRealTimers()
  store.resetForTest()
  await rm(tempRoot, { recursive: true, force: true })
})

describe('fileAttachment upload on a local workspace', () => {
  it('writes the bytes under the original name in a private temp directory', async () => {
    const bytes = Buffer.from(Array.from({ length: 900_000 }, (_, index) => index % 251))
    const result = await upload(LOCAL_WORKTREE, 'report.pdf', bytes)

    expect(result.fileName).toBe('report.pdf')
    expect(result.byteLength).toBe(bytes.byteLength)
    expect(path.basename(result.path)).toBe('report.pdf')
    expect(result.path.startsWith(tempRoot)).toBe(true)
    expect(Buffer.compare(await readFile(result.path), bytes)).toBe(0)
    const directory = path.dirname(result.path)
    expect(await readdir(directory)).toEqual(['report.pdf'])
    if (typeof process.getuid === 'function') {
      expect((await stat(path.dirname(directory))).mode & 0o777).toBe(0o700)
    }
  })

  it('keeps two uploads with the same name apart', async () => {
    const first = await upload(LOCAL_WORKTREE, 'same.txt', Buffer.from('first'))
    const second = await upload(LOCAL_WORKTREE, 'same.txt', Buffer.from('second'))
    expect(first.path).not.toBe(second.path)
    expect((await readFile(first.path)).toString()).toBe('first')
    expect((await readFile(second.path)).toString()).toBe('second')
  })

  it('commits an empty file', async () => {
    const result = await upload(LOCAL_WORKTREE, 'empty.log', Buffer.alloc(0))
    expect((await readFile(result.path)).byteLength).toBe(0)
  })

  it('removes the partial upload on abort', async () => {
    const uploadId = await start({
      worktree: LOCAL_WORKTREE,
      fileName: 'big.zip',
      byteLength: 10
    })
    await ok('fileAttachment.appendUploadChunk', {
      uploadId,
      offset: 0,
      contentBase64: Buffer.from('12345').toString('base64')
    })
    expect(await ok('fileAttachment.abortUpload', { uploadId })).toEqual({ aborted: true })
    const root = (await readdir(tempRoot))[0]
    expect(await readdir(path.join(tempRoot, root ?? ''))).toEqual([])
  })
})

describe('fileAttachment upload on an SSH workspace', () => {
  it('writes to the remote temp directory and nothing locally', async () => {
    const bytes = Buffer.from('remote bytes')
    const result = await upload(SSH_WORKTREE, 'notes.txt', bytes)
    expect(result.path.startsWith('/home/me/tmp/orca-file-attachments/')).toBe(true)
    expect(remote.fileAt(result.path)?.toString()).toBe('remote bytes')
    expect(await readdir(tempRoot)).toEqual([])
  })

  it('routes a folder workspace on an SSH host the same way', async () => {
    const result = await upload(SSH_FOLDER_WORKSPACE, 'a.txt', Buffer.from('x'))
    expect(remote.fileAt(result.path)?.toString()).toBe('x')
  })

  it('joins Windows remote paths with Windows separators', async () => {
    const result = await upload('id:windows-worktree', 'a.txt', Buffer.from('x'))
    expect(result.path).toMatch(
      /^C:\\Users\\me\\AppData\\Local\\Temp\\orca-file-attachments\\\d{13}-/
    )
    expect(windowsRemote.fileAt(result.path)?.toString()).toBe('x')
  })

  it('refuses without reconnecting when the host is out of contact', async () => {
    connected = false
    expect(
      await failure('fileAttachment.startUpload', {
        worktree: SSH_WORKTREE,
        fileName: 'a.txt',
        byteLength: 1
      })
    ).toBe(FILE_ATTACHMENT_HOST_UNAVAILABLE_ERROR)
  })

  it('surfaces a dropped connection mid-upload and abort cleans the remote directory', async () => {
    const uploadId = await start({
      worktree: SSH_WORKTREE,
      fileName: 'a.bin',
      byteLength: 4
    })
    remote.failWrites = true
    expect(
      await failure('fileAttachment.appendUploadChunk', {
        uploadId,
        offset: 0,
        contentBase64: Buffer.from('abcd').toString('base64')
      })
    ).toContain('Remote connection dropped')
    await ok('fileAttachment.abortUpload', { uploadId })
    expect([...remote.entries.keys()]).toEqual([
      '/home/me/tmp',
      '/home/me/tmp/orca-file-attachments'
    ])
  })

  it('sweeps only its own expired upload directories on the next start', async () => {
    const root = '/home/me/tmp/orca-file-attachments'
    const expired = `${root}/${fileAttachmentUploadDirectoryName(Date.now() - FILE_ATTACHMENT_RETENTION_MS - 1, '00000000-0000-0000-0000-000000000000')}`
    const fresh = `${root}/${fileAttachmentUploadDirectoryName(Date.now(), '11111111-1111-1111-1111-111111111111')}`
    const foreign = `${root}/someone-elses`
    for (const dir of [root, expired, fresh, foreign]) {
      remote.entries.set(dir, { kind: 'dir' })
    }
    await upload(SSH_WORKTREE, 'a.txt', Buffer.from('x'))
    await vi.waitFor(() => expect(remote.entries.has(expired)).toBe(false))
    expect(remote.entries.has(fresh)).toBe(true)
    expect(remote.entries.has(foreign)).toBe(true)
  })
})

describe('fileAttachment upload guards', () => {
  it('rejects a declared size over the limit before touching any host', async () => {
    expect(
      await failure('fileAttachment.startUpload', {
        worktree: LOCAL_WORKTREE,
        fileName: 'huge.zip',
        byteLength: FILE_ATTACHMENT_MAX_BYTES + 1
      })
    ).toContain('File is too large to attach')
    expect(await readdir(tempRoot)).toEqual([])
  })

  it('refuses out-of-order chunks and bytes past the declared size', async () => {
    const uploadId = await start({
      worktree: LOCAL_WORKTREE,
      fileName: 'a.bin',
      byteLength: 3
    })
    const chunk = Buffer.from('abc').toString('base64')
    expect(
      await failure('fileAttachment.appendUploadChunk', {
        uploadId,
        offset: 3,
        contentBase64: chunk
      })
    ).toBe('File upload chunk offset is out of order')
    expect(
      await failure('fileAttachment.appendUploadChunk', {
        uploadId,
        offset: 0,
        contentBase64: Buffer.from('abcd').toString('base64')
      })
    ).toBe('File upload exceeded its declared size')
    expect(await failure('fileAttachment.commitUpload', { uploadId })).toBe(
      'File upload is incomplete'
    )
  })

  it('hides one client’s upload from another', async () => {
    const uploadId = await start({
      worktree: LOCAL_WORKTREE,
      fileName: 'a.bin',
      byteLength: 1
    })
    const chunk = Buffer.from('a').toString('base64')
    expect(
      await failure(
        'fileAttachment.appendUploadChunk',
        { uploadId, offset: 0, contentBase64: chunk },
        'device-b'
      )
    ).toBe('File upload was not found')
    expect(await ok('fileAttachment.abortUpload', { uploadId }, 'device-b')).toEqual({
      aborted: false
    })
    expect(await failure('fileAttachment.commitUpload', { uploadId }, 'device-b')).toBe(
      'File upload was not found'
    )
  })

  it('bounds concurrent uploads', async () => {
    for (let index = 0; index < FILE_ATTACHMENT_UPLOAD_MAX_CONCURRENT; index += 1) {
      await ok('fileAttachment.startUpload', {
        worktree: LOCAL_WORKTREE,
        fileName: `f${index}`,
        byteLength: 1
      })
    }
    expect(
      await failure('fileAttachment.startUpload', {
        worktree: LOCAL_WORKTREE,
        fileName: 'one-too-many',
        byteLength: 1
      })
    ).toBe('Too many file uploads are in progress')
  })

  it('expires an idle upload and removes what it wrote', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const uploadId = await start({
      worktree: SSH_WORKTREE,
      fileName: 'a.bin',
      byteLength: 1
    })
    expect(store.activeCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(FILE_ATTACHMENT_UPLOAD_IDLE_TTL_MS + 1)
    expect(store.activeCount()).toBe(0)
    vi.useRealTimers()
    await vi.waitFor(() =>
      expect([...remote.entries.keys()]).toEqual([
        '/home/me/tmp',
        '/home/me/tmp/orca-file-attachments'
      ])
    )
    expect(await failure('fileAttachment.commitUpload', { uploadId })).toBe(
      'File upload was not found'
    )
  })

  it('requires an authenticated mobile client', async () => {
    expect(
      await failure(
        'fileAttachment.startUpload',
        { worktree: LOCAL_WORKTREE, fileName: 'a', byteLength: 1 },
        ''
      )
    ).toBe('File upload requires an authenticated mobile client')
  })
})
