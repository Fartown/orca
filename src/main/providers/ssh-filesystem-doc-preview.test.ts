import { describe, expect, it, vi } from 'vitest'
import type { DocPreviewFileAccessRequest } from '../../shared/doc-preview-file-access'
import { readSshDocPreviewFile } from './ssh-filesystem-doc-preview'

const request: DocPreviewFileAccessRequest = {
  boundaryPath: '/repo',
  entryPath: '/repo/docs/index.html',
  implicitRootPath: '/repo/docs',
  authorizedRootPaths: ['/repo/assets'],
  targetPath: '/repo/docs/app.js',
  maxTextBytes: 1024,
  maxBinaryBytes: 2048
}

function createMux() {
  return {
    request: vi.fn(),
    onNotificationByMethod: vi.fn(() => vi.fn()),
    onDispose: vi.fn(() => vi.fn())
  }
}

describe('readSshDocPreviewFile', () => {
  it('delegates canonical authorization and reading to the relay host', async () => {
    const mux = createMux()
    mux.request.mockResolvedValue({ content: 'ok', isBinary: false })

    await expect(readSshDocPreviewFile(mux as never, request)).resolves.toEqual({
      content: 'ok',
      isBinary: false
    })
    expect(mux.request).toHaveBeenCalledWith('fs.readDocPreview', {
      ...request,
      __streamResponse: true
    })
  })

  it('fails closed when the relay predates scoped preview reads', async () => {
    const mux = createMux()
    mux.request.mockRejectedValue(Object.assign(new Error('Method not found'), { code: -32601 }))

    await expect(readSshDocPreviewFile(mux as never, request)).rejects.toThrow(
      'Reconnect the SSH target'
    )
  })
})
