import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setAppEnvironment } from '../../shared/app-environment'
import { OrcaRuntimeService } from '../runtime/orca-runtime'
import { OrcaRuntimeRpcServer } from '../runtime/runtime-rpc'
import {
  authenticateMobileWsSession,
  createEncryptedWsResponseReader,
  sendEncryptedWsRequest
} from '../runtime/runtime-rpc-mobile-ws-test-harness'

// A paired phone uploads over the real path: WebSocket, E2EE, mobile device scope, the mobile
// allowlist, method dispatch, and the local temp-directory writer.

let root: string
let userDataPath: string

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'orca-file-attachment-ws-')))
  // Short: the runtime's Unix socket lives here and macOS caps socket paths at 104 bytes.
  userDataPath = mkdtempSync(join(tmpdir(), 'ofa-'))
  setAppEnvironment({
    getPath: () => root,
    getAppPath: () => root,
    getVersion: () => 'test',
    isPackaged: () => false,
    onWillQuit: () => {},
    exit: () => {},
    getAppMetrics: () => []
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  rmSync(root, { recursive: true, force: true })
  rmSync(userDataPath, { recursive: true, force: true })
})

describe('file attachment upload from a paired phone', () => {
  it('streams a file through the mobile socket into the workspace host temp directory', async () => {
    const runtime = new OrcaRuntimeService()
    vi.spyOn(runtime, 'showTerminalWorkspaceLaunchScope').mockResolvedValue({
      id: 'wt-1',
      path: join(root, 'repo'),
      connectionId: null,
      repo: null,
      folderWorkspace: null
    })
    const server = new OrcaRuntimeRpcServer({
      runtime,
      userDataPath,
      enableWebSocket: true,
      wsPort: 0
    })
    await server.start()
    try {
      const offer = server.createPairingOffer({
        address: '127.0.0.1',
        name: 'phone',
        scope: 'mobile'
      })
      if (!offer.available) {
        throw new Error('WebSocket pairing unavailable')
      }
      const phone = await authenticateMobileWsSession(offer.pairingUrl)
      const responses = createEncryptedWsResponseReader(phone)
      let sequence = 0
      const request = async (method: string, params: unknown) => {
        sequence += 1
        const id = `phone_${sequence}`
        sendEncryptedWsRequest(phone, { id, method, params })
        return responses.next(id)
      }

      const bytes = Buffer.from(Array.from({ length: 600_000 }, (_, index) => (index * 7) % 256))
      const started = await request('fileAttachment.startUpload', {
        worktree: 'id:wt-1',
        fileName: 'quarterly report.pdf',
        byteLength: bytes.byteLength,
        mimeType: 'application/pdf'
      })
      expect(started.ok).toBe(true)
      const { uploadId } = started.result as { uploadId: string }
      const chunkBytes = (512 * 1024 * 3) / 4
      for (let offset = 0; offset < bytes.byteLength; offset += chunkBytes) {
        const appended = await request('fileAttachment.appendUploadChunk', {
          uploadId,
          offset,
          contentBase64: bytes.subarray(offset, offset + chunkBytes).toString('base64')
        })
        expect(appended.ok).toBe(true)
      }
      const committed = await request('fileAttachment.commitUpload', { uploadId })
      expect(committed.ok).toBe(true)
      const { path, fileName } = committed.result as { path: string; fileName: string }
      expect(fileName).toBe('quarterly report.pdf')
      expect(path.startsWith(join(root, 'orca-file-attachments'))).toBe(true)
      expect(Buffer.compare(readFileSync(path), bytes)).toBe(0)

      // The phone is still a mobile-scoped device: the generic binary writer stays closed to it.
      const refused = await request('files.writeBase64Chunk', {
        worktree: 'id:wt-1',
        relativePath: 'x.bin',
        contentBase64: 'AAAA'
      })
      expect(refused.ok).toBe(false)
      expect((refused.error as { code: string }).code).toBe('forbidden')

      responses.dispose()
      phone.ws.close()
    } finally {
      await server.stop()
    }
  })
})
