import type { RuntimeRpcResponse } from '../../shared/runtime-rpc-envelope'
import type { ArtifactShareConfigureLocalRequest } from '../../shared/self-hosted-artifacts/artifact-share-contract'
import {
  ARTIFACT_SHARE_ERROR_CODES,
  ArtifactShareError
} from '../../shared/self-hosted-artifacts/artifact-share-errors'
import type { ArtifactShareOwnerService } from './artifact-share-owner-service'

export type ArtifactShareRuntimeEnvironmentCall = (
  userDataPath: string,
  environmentId: string,
  method: string,
  params: unknown,
  timeoutMs?: number
) => Promise<RuntimeRpcResponse<unknown>>

/** What the RPC methods need from the app that serves; registered by the desktop main process. */
export type ArtifactShareRuntime = {
  owner: ArtifactShareOwnerService
  userDataPath: string
  configureLocal: (request: ArtifactShareConfigureLocalRequest) => Promise<void>
  callRuntimeEnvironment: ArtifactShareRuntimeEnvironmentCall
}

// Why a registry instead of importing the server: the runtime must boot on plain Node, and the
// server and paired-runtime transport pull in Electron (config/runtime-electron-baseline.txt).
let registered: ArtifactShareRuntime | null = null

export function registerArtifactShareRuntime(runtime: ArtifactShareRuntime | null): void {
  registered = runtime
}

export function requireArtifactShareRuntime(): ArtifactShareRuntime {
  if (!registered) {
    throw new ArtifactShareError(
      ARTIFACT_SHARE_ERROR_CODES.orcaNotRunning,
      'Local network sharing runs in the Orca desktop app, which is not open here.'
    )
  }
  return registered
}
