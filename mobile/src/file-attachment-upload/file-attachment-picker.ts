import * as DocumentPicker from 'expo-document-picker'
import { File as FsFile } from 'expo-file-system'
import { FILE_ATTACHMENT_MAX_BYTES } from '../../../src/shared/file-attachment-upload/file-attachment-upload-limits'
import { encodeBase64Bytes } from '../transport/base64-byte-codec'
import type { FileAttachmentPicker, PickedAttachmentFile } from './picked-attachment-file'

type FileHandle = {
  readBytes(length: number): Uint8Array
  close(): void
}

export type AttachmentFileSystem = {
  readonly size: (uri: string) => number
  readonly open: (uri: string) => FileHandle
  readonly remove: (uri: string) => void
}

const deviceFileSystem: AttachmentFileSystem = {
  size: (uri) => new FsFile(uri).size,
  open: (uri) => new FsFile(uri).open(),
  remove: (uri) => new FsFile(uri).delete()
}

/** Fills each chunk to `chunkBytes` before encoding it, so only the last one may be short. */
export async function* readFileBase64Chunks(
  fileSystem: AttachmentFileSystem,
  uri: string,
  chunkBytes: number
): AsyncGenerator<string> {
  const handle = fileSystem.open(uri)
  try {
    for (;;) {
      const chunk = new Uint8Array(chunkBytes)
      let filled = 0
      while (filled < chunkBytes) {
        const bytes = handle.readBytes(chunkBytes - filled)
        if (bytes.byteLength === 0) {
          break
        }
        chunk.set(bytes, filled)
        filled += bytes.byteLength
      }
      if (filled === 0) {
        return
      }
      yield encodeBase64Bytes(chunk.subarray(0, filled))
      if (filled < chunkBytes) {
        return
      }
    }
  } finally {
    handle.close()
  }
}

export function pickedDocumentFile(
  fileSystem: AttachmentFileSystem,
  asset: DocumentPicker.DocumentPickerAsset
): PickedAttachmentFile {
  let released = false
  const mimeType = asset.mimeType ?? undefined
  return {
    name: asset.name,
    mimeType,
    // The staged copy's own size: a provider's declared `size` is optional and sometimes absent.
    byteLength: fileSystem.size(asset.uri),
    ...(mimeType?.startsWith('image/') ? { previewUri: asset.uri } : {}),
    readBase64Chunks: (chunkBytes) => readFileBase64Chunks(fileSystem, asset.uri, chunkBytes),
    release: async () => {
      if (released) {
        return
      }
      released = true
      try {
        fileSystem.remove(asset.uri)
      } catch {
        // The picker's cache copy; the OS reclaims what this cannot delete.
      }
    }
  }
}

export function createDocumentFileAttachmentPicker(
  launch: typeof DocumentPicker.getDocumentAsync = DocumentPicker.getDocumentAsync,
  fileSystem: AttachmentFileSystem = deviceFileSystem
): FileAttachmentPicker {
  return {
    maxBytes: FILE_ATTACHMENT_MAX_BYTES,
    async pickFiles(multiple) {
      const result = await launch({ type: '*/*', multiple, copyToCacheDirectory: true })
      if (result.canceled) {
        return []
      }
      return result.assets.map((asset) => pickedDocumentFile(fileSystem, asset))
    }
  }
}

const documentPicker = createDocumentFileAttachmentPicker()

export function useFileAttachmentPicker(): FileAttachmentPicker {
  return documentPicker
}
