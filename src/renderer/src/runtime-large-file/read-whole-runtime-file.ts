import type { RuntimeRemoteFileAddress } from '../runtime/runtime-file-range-client'
import type { RuntimeFilePreviewResult } from '../../../shared/runtime-types'
import { RUNTIME_EDITOR_TEXT_MAX_BYTES } from './assemble-runtime-file-chunks'
import { readRemoteFileInChunks, pagedTextFileResult } from '../runtime/runtime-paged-file-read'

export async function readWholeRuntimeFile(
  remote: RuntimeRemoteFileAddress
): Promise<RuntimeFilePreviewResult> {
  const paged = await readRemoteFileInChunks(remote, RUNTIME_EDITOR_TEXT_MAX_BYTES)
  if (paged.kind === 'ok') {
    return pagedTextFileResult(paged.bytes)
  }
  throw new Error(
    paged.kind === 'unsupported'
      ? 'Remote file is larger than the 512 KB this Orca server can send. Update the server to open it.'
      : `Remote file is too large to open in the editor (${paged.size} bytes)`
  )
}
