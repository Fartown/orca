import type { RuntimeRemoteFileAddress } from '../runtime/files/reads/runtime-file-range-client'
import type { RuntimeFilePreviewResult } from '../../../shared/file-content/runtime-file-read'
import { RUNTIME_EDITOR_TEXT_MAX_BYTES } from './assemble-runtime-file-chunks'
import {
  REMOTE_FILE_PAGED_READ_UNSUPPORTED_MESSAGE,
  readRemoteFileInChunks,
  pagedTextFileResult
} from '../runtime/files/reads/runtime-paged-file-read'

export async function readWholeRuntimeFile(
  remote: RuntimeRemoteFileAddress
): Promise<RuntimeFilePreviewResult> {
  const paged = await readRemoteFileInChunks(remote, RUNTIME_EDITOR_TEXT_MAX_BYTES)
  if (paged.kind === 'ok') {
    return pagedTextFileResult(paged.bytes)
  }
  throw new Error(
    paged.kind === 'unsupported'
      ? REMOTE_FILE_PAGED_READ_UNSUPPORTED_MESSAGE
      : `Remote file is too large to open in the editor (${paged.size} bytes)`
  )
}
