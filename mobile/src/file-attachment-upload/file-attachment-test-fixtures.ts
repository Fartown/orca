import type { RpcResponse, RpcSuccess } from '../transport/types'
import type { PickedAttachmentFile } from './picked-attachment-file'

export function rpcOk(result: unknown): RpcSuccess {
  return { id: 'r', ok: true, result, _meta: { runtimeId: 'r' } }
}

export function rpcError(code: string, message: string): RpcResponse {
  return { id: 'r', ok: false, error: { code, message }, _meta: { runtimeId: 'r' } }
}

/** A picked file backed by bytes in memory. */
export function memoryFile(
  name: string,
  bytes: Uint8Array,
  options: { mimeType?: string; previewUri?: string } = {}
): PickedAttachmentFile & { released: () => boolean } {
  let released = false
  return {
    name,
    mimeType: options.mimeType,
    byteLength: bytes.byteLength,
    ...(options.previewUri ? { previewUri: options.previewUri } : {}),
    async *readBase64Chunks(chunkBytes: number) {
      for (let offset = 0; offset < bytes.byteLength; offset += chunkBytes) {
        yield Buffer.from(bytes.subarray(offset, offset + chunkBytes)).toString('base64')
      }
    },
    release: async () => {
      released = true
    },
    released: () => released
  }
}
