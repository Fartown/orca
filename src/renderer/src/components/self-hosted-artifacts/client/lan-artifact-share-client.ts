import {
  ArtifactShareListResult,
  ArtifactShareLookupResult,
  ArtifactShareShareResult,
  ArtifactShareStatusResult,
  type ArtifactShareConfigureLocalRequest
} from '../../../../../shared/self-hosted-artifacts/artifact-share-contract'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { RuntimeRpcCallError } from '@/runtime/runtime-rpc-result'

const LOCAL_RUNTIME = { kind: 'local' } as const

export type LanArtifactShareTarget = {
  executionHostId: string
  /** Omitted for files outside any workspace; the owning computer then scopes the share. */
  workspaceRoot?: string
  sourcePath: string
}

export async function lookupLanArtifactShare(
  target: LanArtifactShareTarget
): Promise<ArtifactShareLookupResult> {
  return ArtifactShareLookupResult.parse(
    await callRuntimeRpc(LOCAL_RUNTIME, 'artifactShare.lookup', target)
  )
}

export async function shareLanArtifact(
  target: LanArtifactShareTarget
): Promise<ArtifactShareShareResult> {
  return ArtifactShareShareResult.parse(
    await callRuntimeRpc(LOCAL_RUNTIME, 'artifactShare.share', target)
  )
}

export async function stopLanArtifactWorkspace(
  executionHostId: string,
  token: string
): Promise<void> {
  await callRuntimeRpc(LOCAL_RUNTIME, 'artifactShare.stopWorkspace', { executionHostId, token })
}

export async function listLanArtifactShares(): Promise<ArtifactShareListResult> {
  return ArtifactShareListResult.parse(
    await callRuntimeRpc(LOCAL_RUNTIME, 'artifactShare.list', {})
  )
}

export async function configureLocalLanArtifactShare(
  request: ArtifactShareConfigureLocalRequest
): Promise<ArtifactShareStatusResult> {
  return ArtifactShareStatusResult.parse(
    await callRuntimeRpc(LOCAL_RUNTIME, 'artifactShare.configureLocal', request)
  )
}

export async function readLocalLanArtifactShareStatus(): Promise<ArtifactShareStatusResult> {
  return ArtifactShareStatusResult.parse(
    await callRuntimeRpc(LOCAL_RUNTIME, 'artifactShare.hostStatus', { executionHostId: 'local' })
  )
}

export function lanArtifactShareErrorCode(error: unknown): string | null {
  return error instanceof RuntimeRpcCallError ? error.code : null
}

export function lanArtifactShareErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
