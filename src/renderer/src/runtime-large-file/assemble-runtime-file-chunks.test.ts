import { describe, expect, it, vi } from 'vitest'
import {
  assembleRuntimeFileFromChunks,
  RuntimeFileTooLargeError,
  type RuntimeFileChunkReader
} from './assemble-runtime-file-chunks'

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return globalThis.btoa(binary)
}

/** A host that answers files.readChunk out of `content`, handing back `chunkBytes` at a time. */
function hostServing(content: string, chunkBytes: number): RuntimeFileChunkReader {
  const bytes = new TextEncoder().encode(content)
  return vi.fn(async (offset: number) => {
    const slice = bytes.slice(offset, offset + chunkBytes)
    return {
      contentBase64: toBase64(slice),
      bytesRead: slice.byteLength,
      eof: offset + slice.byteLength >= bytes.byteLength
    }
  })
}

describe('assembleRuntimeFileFromChunks', () => {
  it('rejoins every chunk in order', async () => {
    const content = Array.from({ length: 500 }, (_, index) => `line ${index}`).join('\n')

    await expect(assembleRuntimeFileFromChunks(hostServing(content, 64))).resolves.toBe(content)
  })

  it('keeps a multi-byte character that straddles a chunk boundary intact', async () => {
    // Why this shape: '中' is three UTF-8 bytes, so a 4-byte chunk splits the second one.
    const content = '中文中文中文'
    const readChunk = hostServing(content, 4)

    await expect(assembleRuntimeFileFromChunks(readChunk)).resolves.toBe(content)
    expect(vi.mocked(readChunk).mock.calls.length).toBeGreaterThan(1)
  })

  it('refuses a file past the cap instead of buffering it all', async () => {
    const readChunk = hostServing('x'.repeat(4096), 512)

    await expect(
      assembleRuntimeFileFromChunks(readChunk, { maxBytes: 1024 })
    ).rejects.toBeInstanceOf(RuntimeFileTooLargeError)
    // Stopped as soon as the cap was passed rather than reading to EOF.
    expect(vi.mocked(readChunk).mock.calls.length).toBeLessThan(8)
  })

  it('stops instead of spinning when the host stops making progress', async () => {
    const readChunk = vi.fn(async () => ({ contentBase64: '', bytesRead: 0, eof: false }))

    await expect(assembleRuntimeFileFromChunks(readChunk)).rejects.toThrow(
      'Remote read stalled before reaching the end of the file'
    )
    expect(readChunk).toHaveBeenCalledTimes(1)
  })

  it('accepts an empty file', async () => {
    await expect(assembleRuntimeFileFromChunks(hostServing('', 64))).resolves.toBe('')
  })
})
