import type { Stats } from 'node:fs'
import type { FileHandle } from 'node:fs/promises'
import { isBinaryBuffer } from '../binary-buffer'
import { validateFileRangeRequest } from '../file-range-read'
import type { DocPreviewFileAccessResult } from '../doc-preview-file-access'
import type { DocumentPreviewChunkRequest } from './document-preview-chunk'

function version(stats: Stats): string {
  return [stats.dev, stats.ino, stats.size, stats.mtimeMs, stats.ctimeMs].join(':')
}

/** The caller owns canonical authorization and closes the verified handle. */
export async function readDocumentPreviewFileChunk(
  handle: FileHandle,
  request: DocumentPreviewChunkRequest,
  maxBytes: number,
  mimeType?: string
): Promise<DocPreviewFileAccessResult> {
  const { position, length } = validateFileRangeRequest(request.offset, request.length)
  const before = await handle.stat()
  if (before.size > maxBytes) {
    throw new Error('file_too_large')
  }
  const fileVersion = version(before)
  if (
    position > before.size ||
    (request.version !== undefined && request.version !== fileVersion)
  ) {
    throw new Error('Document changed during preview; reload it.')
  }
  if (!mimeType) {
    const probe = Buffer.alloc(Math.min(8192, before.size))
    const { bytesRead } = await handle.read(probe, 0, probe.length, 0)
    if (isBinaryBuffer(probe.subarray(0, bytesRead))) {
      return { content: '', isBinary: true }
    }
  }
  const buffer = Buffer.alloc(Math.min(length, before.size - position))
  let offset = 0
  while (offset < buffer.length) {
    const { bytesRead } = await handle.read(
      buffer,
      offset,
      buffer.length - offset,
      position + offset
    )
    if (bytesRead === 0) {
      throw new Error('Document changed during preview; reload it.')
    }
    offset += bytesRead
  }
  if (version(await handle.stat()) !== fileVersion) {
    throw new Error('Document changed during preview; reload it.')
  }
  return {
    content: buffer.toString('base64'),
    isBinary: Boolean(mimeType),
    ...(mimeType ? { mimeType } : {}),
    chunk: { offset: position, totalBytes: before.size, version: fileVersion }
  }
}
