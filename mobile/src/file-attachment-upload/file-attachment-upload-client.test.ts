import { describe, expect, it, vi } from 'vitest'
import { FILE_ATTACHMENT_CHUNK_BYTES } from '../../../src/shared/file-attachment-upload/file-attachment-upload-limits'
import { uploadAttachmentFile } from './file-attachment-upload-client'
import { memoryFile, rpcError, rpcOk } from './file-attachment-test-fixtures'
import type { RpcResponse } from '../transport/types'
import {
  FileAttachmentHostUpdateRequiredError,
  FileAttachmentTooLargeError
} from './picked-attachment-file'

// Faking the raw request port belongs in a test file, which the port boundary census skips.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export type RecordedCall = { method: string; params: Record<string, unknown> }

/** A host that answers each method from a handler, recording every request. */
export function fakeHost(
  handlers: Record<string, (params: Record<string, unknown>) => RpcResponse>
) {
  const calls: RecordedCall[] = []
  return {
    calls,
    sendRequest: vi.fn(async (method: string, params?: unknown) => {
      const recorded = isRecord(params) ? params : {}
      calls.push({ method, params: recorded })
      const handler = handlers[method]
      if (!handler) {
        throw new Error(`unexpected request: ${method}`)
      }
      return handler(recorded)
    })
  }
}

function newHost(failAppendAt?: number) {
  let received = 0
  let appends = 0
  const host = fakeHost({
    'fileAttachment.startUpload': () => rpcOk({ uploadId: 'u1', maxChunkBase64Chars: 524288 }),
    'fileAttachment.appendUploadChunk': (params) => {
      appends += 1
      if (appends === failAppendAt) {
        return rpcError('runtime_error', 'Remote connection dropped')
      }
      received += Buffer.from(String(params.contentBase64), 'base64').byteLength
      return rpcOk({ receivedBytes: received })
    },
    'fileAttachment.commitUpload': () =>
      rpcOk({
        path: '/tmp/orca-file-attachments/1/report.pdf',
        fileName: 'report.pdf',
        byteLength: received
      }),
    'fileAttachment.abortUpload': () => rpcOk({ aborted: true })
  })
  return host
}

const getConnectionId = async () => 'ssh-1'

describe('uploadAttachmentFile', () => {
  it('streams the file in chunks with byte offsets and returns the host path', async () => {
    const bytes = new Uint8Array(FILE_ATTACHMENT_CHUNK_BYTES * 2 + 10).map(
      (_, index) => index % 256
    )
    const host = newHost()
    const uploaded = await uploadAttachmentFile({
      client: host,
      worktreeId: 'repo::/w',
      file: memoryFile('report.pdf', bytes, { mimeType: 'application/pdf' }),
      getConnectionId
    })

    expect(uploaded).toEqual({
      path: '/tmp/orca-file-attachments/1/report.pdf',
      fileName: 'report.pdf'
    })
    expect(host.calls[0]).toEqual({
      method: 'fileAttachment.startUpload',
      params: {
        worktree: 'id:repo::/w',
        fileName: 'report.pdf',
        byteLength: bytes.byteLength,
        mimeType: 'application/pdf'
      }
    })
    const offsets = host.calls
      .filter((call) => call.method === 'fileAttachment.appendUploadChunk')
      .map((call) => call.params.offset)
    expect(offsets).toEqual([0, FILE_ATTACHMENT_CHUNK_BYTES, FILE_ATTACHMENT_CHUNK_BYTES * 2])
    expect(host.calls.at(-1)?.method).toBe('fileAttachment.commitUpload')
  })

  it('aborts the slot when a chunk fails and rethrows', async () => {
    const host = newHost(2)
    await expect(
      uploadAttachmentFile({
        client: host,
        worktreeId: 'w',
        file: memoryFile('a.zip', new Uint8Array(FILE_ATTACHMENT_CHUNK_BYTES + 1)),
        getConnectionId
      })
    ).rejects.toThrow('Remote connection dropped')
    expect(host.calls.at(-1)).toEqual({
      method: 'fileAttachment.abortUpload',
      params: { uploadId: 'u1' }
    })
  })

  it('refuses a file over the limit without asking the host', async () => {
    const host = newHost()
    const file = { ...memoryFile('big.zip', new Uint8Array(1)), byteLength: 100 * 1024 * 1024 + 1 }
    await expect(
      uploadAttachmentFile({ client: host, worktreeId: 'w', file, getConnectionId })
    ).rejects.toBeInstanceOf(FileAttachmentTooLargeError)
    expect(host.calls).toEqual([])
  })

  it('keeps the whole base64 of a small image for an inline preview', async () => {
    const host = newHost()
    const uploaded = await uploadAttachmentFile({
      client: host,
      worktreeId: 'w',
      file: memoryFile('photo.png', new Uint8Array([1, 2, 3, 4])),
      getConnectionId,
      keepInlineImage: true
    })
    expect(uploaded.inlineImageBase64).toBe(Buffer.from([1, 2, 3, 4]).toString('base64'))
  })

  describe('against a computer that predates file uploads', () => {
    for (const code of ['forbidden', 'method_not_found']) {
      it(`sends an agent-readable image through the image channel (${code})`, async () => {
        const host = fakeHost({
          'fileAttachment.startUpload': () => rpcError(code, 'nope'),
          'clipboard.startImageUpload': () => rpcOk({ uploadId: 'c1' }),
          'clipboard.appendImageUploadChunk': () => rpcOk({ receivedBase64Length: 8 }),
          'clipboard.commitImageUpload': () => rpcOk('/tmp/orca-paste-1.png')
        })
        const uploaded = await uploadAttachmentFile({
          client: host,
          worktreeId: 'w',
          file: memoryFile('photo.jpg', new Uint8Array([1, 2, 3, 4, 5])),
          getConnectionId
        })
        expect(uploaded.path).toBe('/tmp/orca-paste-1.png')
        expect(host.calls[1]?.params).toMatchObject({ connectionId: 'ssh-1' })
      })
    }

    it('never sends a non-image through the image channel', async () => {
      const host = fakeHost({
        'fileAttachment.startUpload': () => rpcError('forbidden', 'nope')
      })
      await expect(
        uploadAttachmentFile({
          client: host,
          worktreeId: 'w',
          file: memoryFile('report.pdf', new Uint8Array([1])),
          getConnectionId
        })
      ).rejects.toBeInstanceOf(FileAttachmentHostUpdateRequiredError)
      expect(host.calls.map((call) => call.method)).toEqual(['fileAttachment.startUpload'])
    })
  })
})
