import { describe, expect, it, vi } from 'vitest'

vi.mock('expo-document-picker', () => ({ getDocumentAsync: vi.fn() }))
vi.mock('expo-file-system', () => ({ File: vi.fn() }))

import {
  createDocumentFileAttachmentPicker,
  readFileBase64Chunks,
  type AttachmentFileSystem
} from './file-attachment-picker'

/** A file system whose handle answers short reads, like a provider stream can. */
function memoryFileSystem(files: Record<string, Uint8Array>, maxRead = 5) {
  const removed: string[] = []
  const fileSystem: AttachmentFileSystem = {
    size: (uri) => files[uri]?.byteLength ?? 0,
    open: (uri) => {
      let position = 0
      return {
        readBytes: (length) => {
          const bytes = files[uri] ?? new Uint8Array()
          const slice = bytes.subarray(position, position + Math.min(length, maxRead))
          position += slice.byteLength
          return slice
        },
        close: () => undefined
      }
    },
    remove: (uri) => removed.push(uri)
  }
  return { fileSystem, removed }
}

async function collect(chunks: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = []
  for await (const chunk of chunks) {
    out.push(chunk)
  }
  return out
}

describe('readFileBase64Chunks', () => {
  it('fills every chunk but the last despite short reads', async () => {
    const bytes = new Uint8Array(14).map((_, index) => index)
    const { fileSystem } = memoryFileSystem({ 'file:///a': bytes })
    const chunks = await collect(readFileBase64Chunks(fileSystem, 'file:///a', 6))
    expect(chunks.map((chunk) => Buffer.from(chunk, 'base64').byteLength)).toEqual([6, 6, 2])
    expect(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk, 'base64')))).toEqual(
      Buffer.from(bytes)
    )
  })

  it('reads nothing from an empty file', async () => {
    const { fileSystem } = memoryFileSystem({ 'file:///e': new Uint8Array() })
    expect(await collect(readFileBase64Chunks(fileSystem, 'file:///e', 6))).toEqual([])
  })
})

describe('createDocumentFileAttachmentPicker', () => {
  it('opens the document picker for any type and weighs the staged copy', async () => {
    const { fileSystem, removed } = memoryFileSystem({ 'file:///cache/r.pdf': new Uint8Array(9) })
    const launch = vi.fn(async () => ({
      canceled: false as const,
      assets: [
        {
          uri: 'file:///cache/r.pdf',
          name: 'r.pdf',
          mimeType: 'application/pdf',
          size: 1,
          lastModified: 0
        }
      ]
    }))
    const picker = createDocumentFileAttachmentPicker(launch, fileSystem)
    const [file] = await picker.pickFiles(true)

    expect(launch).toHaveBeenCalledWith({ type: '*/*', multiple: true, copyToCacheDirectory: true })
    expect(file).toMatchObject({ name: 'r.pdf', mimeType: 'application/pdf', byteLength: 9 })
    expect(file?.previewUri).toBeUndefined()
    await file?.release()
    await file?.release()
    expect(removed).toEqual(['file:///cache/r.pdf'])
  })

  it('offers a preview uri for an image and nothing on cancel', async () => {
    const { fileSystem } = memoryFileSystem({ 'file:///cache/p.png': new Uint8Array(3) })
    const picker = createDocumentFileAttachmentPicker(
      vi
        .fn()
        .mockResolvedValueOnce({
          canceled: false,
          assets: [{ uri: 'file:///cache/p.png', name: 'p.png', mimeType: 'image/png' }]
        })
        .mockResolvedValueOnce({ canceled: true, assets: null }),
      fileSystem
    )
    expect((await picker.pickFiles(false))[0]?.previewUri).toBe('file:///cache/p.png')
    expect(await picker.pickFiles(false)).toEqual([])
  })
})
