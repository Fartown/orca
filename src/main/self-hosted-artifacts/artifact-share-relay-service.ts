import { homedir, hostname } from 'node:os'
import type { RelayDispatcher } from '../../relay/dispatcher'
import {
  ARTIFACT_SHARE_RELAY_METHODS,
  ArtifactShareOwnerFileRequest,
  ArtifactShareOwnerStopRequest
} from '../../shared/self-hosted-artifacts/artifact-share-contract'
import {
  isArtifactShareErrorCode,
  type ArtifactShareRelayEnvelope
} from '../../shared/self-hosted-artifacts/artifact-share-errors'
import { createArtifactShareOwnerService } from './artifact-share-owner-service'
import { readArtifactShareServingStatus } from './server/artifact-share-serving-status'
import { resolveArtifactShareHome } from './store/artifact-share-store-layout'

async function toEnvelope(run: () => Promise<unknown>): Promise<ArtifactShareRelayEnvelope> {
  try {
    return { ok: true, value: await run() }
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : null
    return {
      ok: false,
      code: isArtifactShareErrorCode(code) ? code : 'runtime_error',
      message: error instanceof Error ? error.message : String(error)
    }
  }
}

/**
 * The relay answers for the computer it runs on. It never serves pages itself: serving belongs to
 * the Orca app on this computer, whose status it reads from the shared state directory.
 */
export function registerRelayArtifactShare(dispatcher: Pick<RelayDispatcher, 'onRequest'>): void {
  const home = resolveArtifactShareHome(process.env, homedir())
  const owner = createArtifactShareOwnerService({
    home,
    host: { executionHostId: 'local', label: hostname() },
    readStatus: () => readArtifactShareServingStatus(home)
  })
  dispatcher.onRequest(ARTIFACT_SHARE_RELAY_METHODS.status, () => toEnvelope(() => owner.status()))
  dispatcher.onRequest(ARTIFACT_SHARE_RELAY_METHODS.lookup, (raw) =>
    toEnvelope(() => owner.lookup(ArtifactShareOwnerFileRequest.parse(raw)))
  )
  dispatcher.onRequest(ARTIFACT_SHARE_RELAY_METHODS.share, (raw) =>
    toEnvelope(() => owner.share(ArtifactShareOwnerFileRequest.parse(raw)))
  )
  dispatcher.onRequest(ARTIFACT_SHARE_RELAY_METHODS.stopWorkspace, (raw) =>
    toEnvelope(() => owner.stopWorkspace(ArtifactShareOwnerStopRequest.parse(raw).token))
  )
  dispatcher.onRequest(ARTIFACT_SHARE_RELAY_METHODS.list, () => toEnvelope(() => owner.list()))
}
