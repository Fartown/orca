import type {
  RuntimeFileReadChunkResult,
  RuntimeFileReadResult
} from '../../../shared/runtime-types'
import type { RuntimeFileOperationArgs } from '../runtime/runtime-file-client-types'
import { callRuntimeRpc } from '../runtime/runtime-rpc-client'
import { RuntimeRpcCallError } from '../runtime/runtime-rpc-result'
import {
  assembleRuntimeFileFromChunks,
  RUNTIME_EDITOR_CHUNK_BYTES,
  RuntimeFileTooLargeError
} from './assemble-runtime-file-chunks'

export async function readWholeRuntimeFile(
  target: Extract<RuntimeFileOperationArgs['target'], { kind: 'environment' }>,
  worktree: string,
  relativePath: string,
  truncated: RuntimeFileReadResult
): Promise<string> {
  try {
    return await assembleRuntimeFileFromChunks((offset) =>
      callRuntimeRpc<RuntimeFileReadChunkResult>(
        target,
        'files.readChunk',
        { worktree, relativePath, offset, length: RUNTIME_EDITOR_CHUNK_BYTES },
        { timeoutMs: 60_000 }
      )
    )
  } catch (error) {
    if (error instanceof RuntimeFileTooLargeError) {
      throw new Error(`Remote file is too large to open in the editor (${error.byteLength} bytes)`)
    }
    // Why: a host that predates chunked reads can only offer the preview-sized answer, and that
    // answer is not editable. Name the remedy instead of repeating the size.
    if (error instanceof RuntimeRpcCallError && error.code === 'method_not_found') {
      throw new Error(
        `Remote file is too large to open in the editor (${truncated.byteLength} bytes). Update the Orca server to open files this size.`
      )
    }
    throw error
  }
}
