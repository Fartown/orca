import { FILE_ATTACHMENT_MAX_BYTES } from '../../../src/shared/file-attachment-upload/file-attachment-upload-limits'
import { BridgeNativeVerbRefusedError } from '../mobile-web-shell/bridge-host-errors'
import type { MediaHandleRegistry } from '../mobile-web-shell/media-handle-registry'
import { filePickParamsSchema, type BridgeFileItem } from './bridge-file-verbs'

/**
 * The most one pick may stage at once. Handles share the media registry's eight-handle room, and
 * eight files at the upload ceiling would be 800 MiB of cache the OS may reclaim mid-read.
 */
export const FILE_PICK_MAX_TOTAL_BYTES = 2 * FILE_ATTACHMENT_MAX_BYTES

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

export type NativeFileVerbDeps = {
  /** The media registry: `native.media.read` and `release` serve these handles too. */
  readonly registry: MediaHandleRegistry
  readonly launchFiles: (multiple: boolean) => Promise<DocumentPickResult>
  readonly sizeOf: (uri: string) => number
  /** Whether this shell can delete what the uri names; only its own cache copies qualify. */
  readonly ownsStagedUri: (uri: string) => boolean
  readonly discard: (uri: string) => void
}

const UNKNOWN_MIME = 'application/octet-stream'

/**
 * Serves `native.file.pick` for the page. Files are never copied here: the document picker already
 * answers a copy in this app's cache, and a copy of 100 MiB through `bytesSync` would hold it all in
 * memory, so an answer that is not ours is refused instead.
 */
export function createNativeFileVerbServer(
  deps: NativeFileVerbDeps
): (params: unknown) => Promise<{ items: BridgeFileItem[] }> {
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

  function refuse(documents: readonly PickedDocument[], error: Error): never {
    discardAll(documents)
    throw error
  }

  return async (params) => {
    const { multiple } = filePickParamsSchema.parse(params)
    const room = deps.registry.remainingCapacity()
    if (room <= 0) {
      throw new BridgeNativeVerbRefusedError(
        'native_media_handle_cap',
        'this page is holding every staged item it may; release one before picking again'
      )
    }
    const result = await deps.launchFiles(multiple)
    const documents = result.canceled ? [] : (result.assets ?? [])
    if (documents.length > room) {
      refuse(
        documents,
        new BridgeNativeVerbRefusedError(
          'native_media_handle_cap',
          `that pick answered ${documents.length} files and this page has room for ${room}`
        )
      )
    }
    const staged = []
    let total = 0
    for (const document of documents) {
      if (!deps.ownsStagedUri(document.uri)) {
        refuse(
          documents,
          new Error(`a picker answered a uri this shell does not own: ${document.uri}`)
        )
      }
      const size = deps.sizeOf(document.uri)
      total += size
      if (size > FILE_ATTACHMENT_MAX_BYTES || total > FILE_PICK_MAX_TOTAL_BYTES) {
        refuse(
          documents,
          new BridgeNativeVerbRefusedError(
            'native_media_too_large',
            `that pick stages ${total} bytes; one file may be ${FILE_ATTACHMENT_MAX_BYTES} and a pick ${FILE_PICK_MAX_TOTAL_BYTES}`
          )
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
}
