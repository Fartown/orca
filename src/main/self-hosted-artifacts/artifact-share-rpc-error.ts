import type { RpcEnvelopeMeta, RpcFailure } from '../runtime/rpc/core'
import { errorResponse, mapRuntimeError } from '../runtime/rpc/errors'
import { ArtifactShareError } from '../../shared/self-hosted-artifacts/artifact-share-errors'

export const ARTIFACT_SHARE_RPC_METHOD_PREFIX = 'artifactShare.'

/** Sharing failures keep their code over RPC so clients can say which computer needs what. */
export function mapArtifactShareRpcError(
  id: string,
  meta: RpcEnvelopeMeta,
  error: unknown
): RpcFailure {
  return error instanceof ArtifactShareError
    ? errorResponse(id, meta, error.code, error.message)
    : mapRuntimeError(id, meta, error)
}
