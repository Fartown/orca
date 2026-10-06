import { useMemo } from 'react'
import { fileAttachmentExtensionForMime } from '../../../src/shared/file-attachment-upload/file-attachment-file-name'
import type { BridgeMediaItem } from '../mobile-web-shell/bridge/bridge-media-verbs'
import { BRIDGE_MEDIA_READ_MAX_BYTES } from '../mobile-web-shell/bridge/bridge-media-verbs'
import { MEDIA_STAGED_MAX_BYTES } from '../mobile-web-shell/media-handle-registry'
import {
  NativeVerbError,
  useNativeVerbs,
  type NativeVerbs
} from '../mobile-web-shell/bridge/use-native-verbs'

/** The three media verbs a file pick uses; the rest of the shell's surface is not reachable here. */
export type StagedMediaVerbs = Pick<NativeVerbs, 'pickMedia' | 'readMedia' | 'releaseMedia'>

async function releaseQuietly(verbs: StagedMediaVerbs, handle: string): Promise<void> {
  try {
    await verbs.releaseMedia(handle)
  } catch (error) {
    // The shell's TTL sweep reclaims a handle this could not release.
    console.warn('[page] a staged file handle could not be released', { handle }, error)
  }
}
import { base64DecodedByteLength } from './attachment-base64-length'
import {
  FileAttachmentShellLimitError,
  type FileAttachmentPicker,
  type PickedAttachmentFile
} from './picked-attachment-file'

/** The shell's picker reports no file name, so the host gets one built from the type. */
function nameForMime(mime: string): string {
  return `attachment${fileAttachmentExtensionForMime(mime) ?? '.bin'}`
}

export async function* readStagedMediaBase64Chunks(
  verbs: Pick<NativeVerbs, 'readMedia'>,
  item: BridgeMediaItem,
  chunkBytes: number
): AsyncGenerator<string> {
  // The shell caps one read; the upload chunk is the same size, so each read is one chunk.
  const length = Math.min(chunkBytes, BRIDGE_MEDIA_READ_MAX_BYTES)
  let offset = 0
  while (offset < item.byteLength) {
    const chunk = await verbs.readMedia(
      item.handle,
      offset,
      Math.min(length, item.byteLength - offset)
    )
    const bytes = base64DecodedByteLength(chunk.base64)
    if (bytes === 0) {
      throw new Error(`the shell answered no bytes for ${item.handle} at ${offset}`)
    }
    offset += bytes
    yield chunk.base64
    if (chunk.eof) {
      break
    }
  }
  if (offset !== item.byteLength) {
    throw new Error(
      `the shell answered ${offset} bytes for an item it declared as ${item.byteLength}`
    )
  }
}

function stagedMediaFile(verbs: StagedMediaVerbs, item: BridgeMediaItem): PickedAttachmentFile {
  let released = false
  return {
    name: nameForMime(item.mime),
    mimeType: item.mime,
    byteLength: item.byteLength,
    readBase64Chunks: (chunkBytes) => readStagedMediaBase64Chunks(verbs, item, chunkBytes),
    release: async () => {
      if (!released) {
        released = true
        await releaseQuietly(verbs, item.handle)
      }
    }
  }
}

/**
 * Web sibling: the page has no Files app, so the shell picks and stages for it. This shell's
 * staging holds as much as an image, which is the ceiling a file gets here.
 */
export function createStagedMediaFileAttachmentPicker(
  verbs: StagedMediaVerbs
): FileAttachmentPicker {
  return {
    maxBytes: MEDIA_STAGED_MAX_BYTES,
    async pickFiles(multiple) {
      let items: readonly BridgeMediaItem[]
      try {
        items = await verbs.pickMedia('files', multiple)
      } catch (error) {
        if (error instanceof NativeVerbError && error.reason === 'native_media_too_large') {
          throw new FileAttachmentShellLimitError(MEDIA_STAGED_MAX_BYTES)
        }
        throw error
      }
      return items.map((item) => stagedMediaFile(verbs, item))
    }
  }
}

export function useFileAttachmentPicker(): FileAttachmentPicker {
  const verbs = useNativeVerbs()
  return useMemo(() => createStagedMediaFileAttachmentPicker(verbs), [verbs])
}
