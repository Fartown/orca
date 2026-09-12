import { describe, expect, it, vi } from 'vitest'
import { readDocumentPreviewInChunks } from './document-preview-chunk-reader'

describe('document preview chunk compatibility', () => {
  it('accepts an old host full response without requiring new fields', async () => {
    const result = { content: '<h1>old host</h1>', isBinary: false }
    const read = vi.fn().mockResolvedValue(result)
    await expect(readDocumentPreviewInChunks(read)).resolves.toEqual(result)
    expect(read).toHaveBeenCalledOnce()
  })

  it('preserves typed binary content and empty documents', async () => {
    for (const content of [Buffer.alloc(0), Buffer.from([0, 255, 13, 10])]) {
      for (const isBinary of [true, false]) {
        const read = vi.fn().mockResolvedValue({
          content: content.toString('base64'),
          isBinary,
          ...(isBinary ? { mimeType: 'image/png' } : {}),
          chunk: { offset: 0, totalBytes: content.length, version: 'v1' }
        })
        await expect(readDocumentPreviewInChunks(read)).resolves.toEqual({
          content: content.toString(isBinary ? 'base64' : 'utf8'),
          isBinary,
          ...(isBinary ? { mimeType: 'image/png' } : {})
        })
      }
    }
  })

  it('rejects truncated chunks instead of rendering partial documents', async () => {
    const read = vi.fn().mockResolvedValue({
      content: Buffer.from('partial').toString('base64'),
      isBinary: false,
      chunk: { offset: 0, totalBytes: 100, version: 'v1' }
    })
    await expect(readDocumentPreviewInChunks(read)).rejects.toThrow('Incomplete')
    expect(read).toHaveBeenCalledOnce()
  })

  it('rejects file replacement between chunks', async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce({
        content: Buffer.alloc(256 * 1024, 97).toString('base64'),
        isBinary: false,
        chunk: { offset: 0, totalBytes: 512 * 1024, version: 'v1' }
      })
      .mockResolvedValueOnce({
        content: Buffer.alloc(256 * 1024, 98).toString('base64'),
        isBinary: false,
        chunk: { offset: 256 * 1024, totalBytes: 512 * 1024, version: 'v2' }
      })
    await expect(readDocumentPreviewInChunks(read)).rejects.toThrow('Invalid')
  })
})
