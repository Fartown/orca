import type { DocPreviewFileAccessResult } from '../../shared/doc-preview-file-access'
import type { DocumentPreviewChunkRequest } from '../../shared/document-preview-size/document-preview-chunk'
import { DOCUMENT_PREVIEW_TEXT_MAX_BYTES } from '../../shared/document-preview-size/document-preview-size-limit'
import { MAX_FILE_RANGE_READ_BYTES } from '../../shared/file-range-read'

export async function readDocumentPreviewInChunks(
  read: (chunk: DocumentPreviewChunkRequest) => Promise<DocPreviewFileAccessResult>
): Promise<DocPreviewFileAccessResult> {
  const parts: Buffer[] = []
  let offset = 0
  let version: string | undefined
  let totalBytes: number | undefined
  while (true) {
    const result = await read({
      offset,
      length: MAX_FILE_RANGE_READ_BYTES,
      ...(version ? { version } : {})
    })
    // Old hosts ignore the optional request field and return the original full-file response.
    if (!result.chunk && offset === 0) {
      return result
    }
    const chunk = result.chunk
    if (
      !chunk ||
      chunk.offset !== offset ||
      !Number.isSafeInteger(chunk.totalBytes) ||
      chunk.totalBytes < 0 ||
      chunk.totalBytes > (result.isBinary ? 50 * 1024 * 1024 : DOCUMENT_PREVIEW_TEXT_MAX_BYTES) ||
      (version !== undefined && version !== chunk.version) ||
      (totalBytes !== undefined && totalBytes !== chunk.totalBytes)
    ) {
      throw new Error('Invalid document preview chunk')
    }
    const bytes = Buffer.from(result.content, 'base64')
    if (bytes.length !== Math.min(MAX_FILE_RANGE_READ_BYTES, chunk.totalBytes - offset)) {
      throw new Error('Incomplete document preview chunk')
    }
    parts.push(bytes)
    offset += bytes.length
    version = chunk.version
    totalBytes = chunk.totalBytes
    if (offset === totalBytes) {
      return {
        content: Buffer.concat(parts, totalBytes).toString(result.isBinary ? 'base64' : 'utf8'),
        isBinary: result.isBinary,
        ...(result.mimeType ? { mimeType: result.mimeType } : {})
      }
    }
  }
}
