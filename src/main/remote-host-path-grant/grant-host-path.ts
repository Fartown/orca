import type { RuntimeTerminalFileGrantHost } from '../runtime/terminal/artifacts/file-grants'
import type { RuntimeTerminalArtifacts } from '../runtime/terminal/artifacts/terminal-artifacts'
import { canonicalPathForArtifactComparison } from '../runtime/terminal/artifacts/artifact-integrity'
import { requireLocalRuntimeFileRoute } from '../runtime/files/file-target'
import {
  hostGrantPathCandidate,
  HOST_PATH_GRANT_DIRECTORY_MESSAGE,
  HOST_PATH_GRANT_PROVENANCE,
  HOST_PATH_GRANT_REQUIRES_ABSOLUTE_MESSAGE
} from './host-path-grant-policy'

export async function grantHostPath(
  host: RuntimeTerminalFileGrantHost,
  artifacts: Pick<RuntimeTerminalArtifacts, 'resolveAbsoluteFileGrant'>,
  worktreeSelector: string,
  absolutePath: string,
  clientId?: string
) {
  const candidate = hostGrantPathCandidate(absolutePath)
  if (!candidate) {
    throw new Error(HOST_PATH_GRANT_REQUIRES_ABSOLUTE_MESSAGE)
  }
  const target = await host.resolveRuntimeFileTarget(worktreeSelector)
  // SSH clients call the owning orcad; a foreign host must never read this machine's path.
  requireLocalRuntimeFileRoute(target)
  const artifactPath = await canonicalPathForArtifactComparison(candidate)
  const resolution = await artifacts.resolveAbsoluteFileGrant({
    worktreeId: target.worktree.id,
    artifactPath,
    clientId,
    readOnly: false,
    provenance: HOST_PATH_GRANT_PROVENANCE
  })
  if (resolution.isDirectory) {
    throw new Error(HOST_PATH_GRANT_DIRECTORY_MESSAGE)
  }
  return resolution
}
