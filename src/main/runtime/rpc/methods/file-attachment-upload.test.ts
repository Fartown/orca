import { getOwnedTempStagingRoot } from '../../../window/owned-temp-staging-root'
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
  FILE_ATTACHMENT_UPLOAD_IDLE_TTL_MS,
  FILE_ATTACHMENT_UPLOAD_MAX_CONCURRENT_PER_CLIENT,
  FileAttachmentUploadStore
} from '../../../file-attachment-upload/file-attachment-upload-store'
import {
  createLocalFileAttachmentTarget,
  type FileAttachmentUploadTarget
} from '../../../file-attachment-upload/file-attachment-upload-target'
import { createFileAttachmentUploadMethods } from './file-attachment-upload'

const LOCAL_WORKTREE = 'id:local-worktree'
const SSH_WORKTREE = 'id:ssh-worktree'
const SSH_FOLDER_WORKSPACE = 'id:folder:ssh-folder'

let tempRoot: string
let store: FileAttachmentUploadStore
let dispatcher: RpcDispatcher
let localTarget: FileAttachmentUploadTarget

function workspaceScope(selector: string) {
  const connectionId = selector === 'id:legacy-ssh' ? 'unserved' : null
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
      localTarget: () => localTarget
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

describe('fileAttachment upload on the owning orcad', () => {
  it.each([SSH_WORKTREE, SSH_FOLDER_WORKSPACE])(
    'stores files for a served workspace on this host (%s)',
    async (worktree) => {
      const bytes = Buffer.from('remote owner bytes')
      const result = await upload(worktree, 'remote.pdf', bytes)
      expect(await readFile(result.path)).toEqual(bytes)
      expect(result.path.startsWith(tempRoot + path.sep)).toBe(true)
      expect((await stat(path.dirname(result.path))).mode & 0o077).toBe(0)
    }
  )

  it('refuses an unserved SSH workspace without writing a local file', async () => {
    expect(
      await failure('fileAttachment.startUpload', {
        worktree: 'id:legacy-ssh',
        fileName: 'a.bin',
        byteLength: 1
      })
    ).toBe(FILE_ATTACHMENT_HOST_UNAVAILABLE_ERROR)
    expect(await readdir(tempRoot)).toEqual([])
  })

  it('does not leave a completed file when the owner write fails', async () => {
    const originalAppend = localTarget.append
    const uploadId = await start({ worktree: SSH_WORKTREE, fileName: 'a.bin', byteLength: 1 })
    localTarget.append = async () => {
      throw new Error('owner storage unavailable')
    }
    expect(
      await failure('fileAttachment.appendUploadChunk', {
        uploadId,
        offset: 0,
        contentBase64: Buffer.from('x').toString('base64')
      })
    ).toContain('owner storage unavailable')
    localTarget.append = originalAppend
    await ok('fileAttachment.abortUpload', { uploadId })
    expect(await readdir(getOwnedTempStagingRoot(tempRoot, 'orca-file-attachments'))).toEqual([])
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

  it('bounds concurrent uploads per client without locking other clients out', async () => {
    for (let index = 0; index < FILE_ATTACHMENT_UPLOAD_MAX_CONCURRENT_PER_CLIENT; index += 1) {
      await start({ worktree: LOCAL_WORKTREE, fileName: `f${index}`, byteLength: 1 })
    }
    expect(
      await failure('fileAttachment.startUpload', {
        worktree: LOCAL_WORKTREE,
        fileName: 'one-too-many',
        byteLength: 1
      })
    ).toBe('Too many file uploads are in progress')
    await start({ worktree: LOCAL_WORKTREE, fileName: 'other-phone', byteLength: 1 }, 'device-b')
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
    await vi.waitFor(async () =>
      expect(await readdir(getOwnedTempStagingRoot(tempRoot, 'orca-file-attachments'))).toEqual([])
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
