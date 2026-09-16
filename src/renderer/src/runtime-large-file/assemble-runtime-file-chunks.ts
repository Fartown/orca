import type { RuntimeFileReadChunkResult } from '../../../shared/runtime-types'

/**
 * Read a whole file off a paired runtime with `files.readChunk`.
 *
 * Why this exists: `files.read` is preview-sized, so any file past that budget came back
 * `truncated` and the editor refused it — correctly, because saving a truncated buffer would
 * drop the rest of the file. `files.readChunk` is the same RPC the download path already uses,
 * so the whole file is reachable without adding anything to the wire.
 */

/** Matches the SSH text cap, the other remote transport an editor buffer can arrive over. */
export const RUNTIME_EDITOR_TEXT_MAX_BYTES = 10 * 1024 * 1024

/** The download path's chunk size: comfortably inside the 512 KiB `files.readChunk` bound. */
export const RUNTIME_EDITOR_CHUNK_BYTES = 384 * 1024

export class RuntimeFileTooLargeError extends Error {
  constructor(readonly byteLength: number) {
    super(`File is too large to open in the editor (${byteLength} bytes)`)
    this.name = 'RuntimeFileTooLargeError'
  }
}

function base64ToBytes(value: string): Uint8Array {
  const binary = globalThis.atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

export type RuntimeFileChunkReader = (offset: number) => Promise<RuntimeFileReadChunkResult>

export async function assembleRuntimeFileFromChunks(
  readChunk: RuntimeFileChunkReader,
  { maxBytes = RUNTIME_EDITOR_TEXT_MAX_BYTES }: { maxBytes?: number } = {}
): Promise<string> {
  const parts: Uint8Array[] = []
  let offset = 0
  for (;;) {
    const chunk = await readChunk(offset)
    if (chunk.bytesRead > 0) {
      parts.push(base64ToBytes(chunk.contentBase64))
      offset += chunk.bytesRead
      if (offset > maxBytes) {
        throw new RuntimeFileTooLargeError(offset)
      }
    }
    if (chunk.eof) {
      break
    }
    // Why: without progress the loop would spin forever against a host that keeps answering
    // "not EOF, nothing read" — the download path guards the same way.
    if (chunk.bytesRead <= 0) {
      throw new Error('Remote read stalled before reaching the end of the file')
    }
  }
  const joined = new Uint8Array(offset)
  let written = 0
  for (const part of parts) {
    joined.set(part, written)
    written += part.byteLength
  }
  // Why decode once at the end: a multi-byte character can straddle a chunk boundary, so
  // decoding per chunk would corrupt it.
  return new TextDecoder('utf-8').decode(joined)
}
