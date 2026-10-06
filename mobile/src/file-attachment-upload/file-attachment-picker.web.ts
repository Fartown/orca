import { useMemo } from 'react'
import { fileAttachmentExtensionForMime } from '../../../src/shared/file-attachment-upload/file-attachment-file-name'
import { FILE_ATTACHMENT_MAX_BYTES } from '../../../src/shared/file-attachment-upload/file-attachment-upload-limits'
import {
  BRIDGE_MEDIA_READ_MAX_BYTES,
  type BridgeMediaChunk,
  type BridgeMediaItem
} from '../mobile-web-shell/bridge/bridge-media-verbs'
import type { BridgeRpcClient } from '../mobile-web-shell/bridge/bridge-rpc-client'
import { MEDIA_STAGED_MAX_BYTES } from '../mobile-web-shell/media-handle-registry'
import {
  NATIVE_VERB_REASONS,
  NativeVerbError,
  useNativeVerbs,
  type NativeVerbReason,
  type NativeVerbs
} from '../mobile-web-shell/bridge/use-native-verbs'
import { usePageBridgeClient } from '../transport/client-context.web'
import { base64DecodedByteLength } from './attachment-base64-length'
import { filePickResultSchema, type BridgeFileItem } from './bridge-file-verbs'
import {
  FileAttachmentShellLimitError,
  FileAttachmentTooLargeError,
  type FileAttachmentPicker,
  type PickedAttachmentFile
} from './picked-attachment-file'

/** The three media verbs a file pick uses; the rest of the shell's surface is not reachable here. */
export type StagedMediaVerbs = Pick<NativeVerbs, 'pickMedia' | 'readMedia' | 'releaseMedia'>

/** `native.file.pick`, as this page calls it; its handles are read through the media verbs. */
export type ShellFilePick = (multiple: boolean) => Promise<readonly BridgeFileItem[]>

type ReadRange = (offset: number, length: number) => Promise<BridgeMediaChunk>

/** A staged item with no name of its own gets one built from its type. */
function nameForMime(mime: string): string {
  return `attachment${fileAttachmentExtensionForMime(mime) ?? '.bin'}`
}

/** Reads a shell-staged item one upload chunk at a time; the shell caps each read at the same size. */
export async function* readShellStagedBase64Chunks(
  read: ReadRange,
  label: string,
  byteLength: number,
  chunkBytes: number
): AsyncGenerator<string> {
  const length = Math.min(chunkBytes, BRIDGE_MEDIA_READ_MAX_BYTES)
  let offset = 0
  while (offset < byteLength) {
    const chunk = await read(offset, Math.min(length, byteLength - offset))
    const bytes = base64DecodedByteLength(chunk.base64)
    if (bytes === 0) {
      throw new Error(`the shell answered no bytes for ${label} at ${offset}`)
    }
    offset += bytes
    yield chunk.base64
    if (chunk.eof) {
      break
    }
  }
  if (offset !== byteLength) {
    throw new Error(`the shell answered ${offset} bytes for an item it declared as ${byteLength}`)
  }
}

function shellStagedFile(
  item: { handle: string; name: string; mime: string; byteLength: number },
  read: ReadRange,
  release: (handle: string) => Promise<boolean>
): PickedAttachmentFile {
  let released = false
  return {
    name: item.name || nameForMime(item.mime),
    mimeType: item.mime,
    byteLength: item.byteLength,
    readBase64Chunks: (chunkBytes) =>
      readShellStagedBase64Chunks(read, item.handle, item.byteLength, chunkBytes),
    release: async () => {
      if (released) {
        return
      }
      released = true
      try {
        await release(item.handle)
      } catch (error) {
        // The shell's TTL sweep reclaims a handle this could not release.
        console.warn('[page] a staged file handle could not be released', item.handle, error)
      }
    }
  }
}

/** A shell built before `native.file.*` stages files through the media verbs, at the image ceiling. */
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
      return items.map((item) =>
        shellStagedFile(
          { ...item, name: '' },
          (offset, length) => verbs.readMedia(item.handle, offset, length),
          verbs.releaseMedia
        )
      )
    }
  }
}

/** A shell with `native.file.pick` names each file and stages up to the upload ceiling. */
export function createShellFileAttachmentPicker(
  pick: ShellFilePick,
  verbs: Pick<StagedMediaVerbs, 'readMedia' | 'releaseMedia'>
): FileAttachmentPicker {
  return {
    maxBytes: FILE_ATTACHMENT_MAX_BYTES,
    async pickFiles(multiple) {
      let items: readonly BridgeFileItem[]
      try {
        items = await pick(multiple)
      } catch (error) {
        if (error instanceof NativeVerbError && error.reason === 'native_media_too_large') {
          throw new FileAttachmentTooLargeError(FILE_ATTACHMENT_MAX_BYTES)
        }
        throw error
      }
      return items.map((item) =>
        shellStagedFile(
          item,
          (offset, length) => verbs.readMedia(item.handle, offset, length),
          verbs.releaseMedia
        )
      )
    }
  }
}

/** The shell's code, floored to a reason this page knows, like `use-native-verbs` does. */
function shellReason(error: unknown): NativeVerbReason {
  const code =
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : null
  return NATIVE_VERB_REASONS.find((reason) => reason === code) ?? 'unreported'
}

function grantsNamedFilePick(client: BridgeRpcClient): boolean {
  const granted = client.getShellSession()?.grants.native ?? []
  return ['native.file.pick', 'native.media.read', 'native.media.release'].every((verb) =>
    granted.includes(verb)
  )
}

function bridgeFilePick(client: BridgeRpcClient): ShellFilePick {
  return async (multiple) => {
    try {
      const reply = await client.callNativeVerb('native.file.pick', { multiple })
      return filePickResultSchema.parse(reply.result).items
    } catch (error) {
      throw new NativeVerbError(
        shellReason(error),
        error instanceof Error ? error.message : 'native.file.pick failed'
      )
    }
  }
}

/**
 * Web sibling: the page has no Files app, so the shell picks and stages for it. Which verbs the
 * shell grants is read at pick time, because a page can mount before its session is open.
 */
export function useFileAttachmentPicker(): FileAttachmentPicker {
  const verbs = useNativeVerbs()
  const client = usePageBridgeClient()
  return useMemo(() => {
    const legacy = createStagedMediaFileAttachmentPicker(verbs)
    const named = createShellFileAttachmentPicker(bridgeFilePick(client), verbs)
    const current = () => (grantsNamedFilePick(client) ? named : legacy)
    return {
      get maxBytes() {
        return current().maxBytes
      },
      pickFiles: (multiple) => current().pickFiles(multiple)
    }
  }, [client, verbs])
}
