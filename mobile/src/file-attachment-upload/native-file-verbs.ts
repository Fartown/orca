import { FILE_ATTACHMENT_MAX_BYTES } from '../../../src/shared/file-attachment-upload/file-attachment-upload-limits'
import { BridgeNativeVerbRefusedError } from '../mobile-web-shell/bridge-host-errors'
import { BRIDGE_MEDIA_READ_MAX_BYTES } from '../mobile-web-shell/bridge/bridge-media-verbs'
import type { MediaHandleRegistry } from '../mobile-web-shell/media-handle-registry'
import { encodeBase64Bytes } from '../transport/base64-byte-codec'
import {
  filePickParamsSchema,
  fileReadParamsSchema,
  fileReleaseParamsSchema,
  type BridgeFileItem,
  type BridgeFileVerb
} from './bridge-file-verbs'

/** A picker's answer, in the shape `expo-document-picker` hands back. */
type PickedDocument = {
  readonly uri: string
  readonly name: string
  readonly mimeType?: string | null
}

type DocumentPickResult = {
  readonly canceled: boolean
  readonly assets?: readonly PickedDocument[] | null
}

type StagedFileHandle = {
  offset: number | null
  readBytes(length: number): Uint8Array
  close(): void
}

export type NativeFileVerbDeps = {
  /** Its own registry, apart from media: a file pick never spends a photo's handle room. */
  readonly registry: MediaHandleRegistry
  readonly launchFiles: (multiple: boolean) => Promise<DocumentPickResult>
  readonly sizeOf: (uri: string) => number
  readonly open: (uri: string) => StagedFileHandle
  /** Whether this shell can delete what the uri names; only its own cache copies qualify. */
  readonly ownsStagedUri: (uri: string) => boolean
  readonly discard: (uri: string) => void
}

const UNKNOWN_MIME = 'application/octet-stream'

/**
 * Serves `native.file.*` for the page. Files are never copied here: the document picker already
 * answers a copy in this app's cache, and a copy of 100 MiB through `bytesSync` would hold it all in
 * memory, so an answer that is not ours is refused instead.
 */
export function createNativeFileVerbServer(
  deps: NativeFileVerbDeps
): (verb: BridgeFileVerb, params: unknown) => Promise<unknown> {
  function discardAll(documents: readonly PickedDocument[]): void {
    for (const document of documents) {
      if (deps.ownsStagedUri(document.uri)) {
        try {
          deps.discard(document.uri)
        } catch {
          // The cache is the OS's to reclaim.
        }
      }
    }
  }

  async function pick(multiple: boolean): Promise<{ items: BridgeFileItem[] }> {
    const room = deps.registry.remainingCapacity()
    if (room <= 0) {
      throw new BridgeNativeVerbRefusedError(
        'native_media_handle_cap',
        'this page is holding every staged file it may; release one before picking again'
      )
    }
    const result = await deps.launchFiles(multiple)
    const documents = result.canceled ? [] : (result.assets ?? [])
    if (documents.length > room) {
      discardAll(documents)
      throw new BridgeNativeVerbRefusedError(
        'native_media_handle_cap',
        `that pick answered ${documents.length} files and this page has room for ${room}`
      )
    }
    const staged = []
    for (const document of documents) {
      if (!deps.ownsStagedUri(document.uri)) {
        discardAll(documents)
        throw new Error(`a picker answered a uri this shell does not own: ${document.uri}`)
      }
      const size = deps.sizeOf(document.uri)
      if (size > FILE_ATTACHMENT_MAX_BYTES) {
        discardAll(documents)
        throw new BridgeNativeVerbRefusedError(
          'native_media_too_large',
          `a picked file is ${size} bytes, over the ${FILE_ATTACHMENT_MAX_BYTES} this shell stages`
        )
      }
      staged.push({ uri: document.uri, mime: document.mimeType || UNKNOWN_MIME, byteLength: size })
    }
    const minted = deps.registry.mint(staged)
    return {
      items: minted.map((item, index) => ({
        handle: item.handle,
        name: documents[index]?.name ?? '',
        mime: item.mime,
        byteLength: item.byteLength
      }))
    }
  }

  function readRange(uri: string, start: number, end: number): string {
    const handle = deps.open(uri)
    try {
      handle.offset = start
      const chunk = new Uint8Array(end - start)
      let filled = 0
      while (filled < chunk.byteLength) {
        const bytes = handle.readBytes(
          Math.min(BRIDGE_MEDIA_READ_MAX_BYTES, chunk.byteLength - filled)
        )
        if (bytes.byteLength === 0) {
          break
        }
        chunk.set(bytes, filled)
        filled += bytes.byteLength
      }
      return encodeBase64Bytes(chunk.subarray(0, filled))
    } finally {
      handle.close()
    }
  }

  return async (verb, params) => {
    if (verb === 'native.file.pick') {
      return pick(filePickParamsSchema.parse(params).multiple)
    }
    if (verb === 'native.file.read') {
      const { handle, offset, length } = fileReadParamsSchema.parse(params)
      const range = deps.registry.read(handle, offset, length)
      return { base64: readRange(range.uri, range.start, range.end), eof: range.eof }
    }
    const { handle } = fileReleaseParamsSchema.parse(params)
    return { released: deps.registry.release(handle) }
  }
}
