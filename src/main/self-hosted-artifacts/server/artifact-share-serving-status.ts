import type { ArtifactShareServiceStatus } from '../../../shared/self-hosted-artifacts/artifact-share-contract'
import { artifactShareLogPath } from '../store/artifact-share-store-layout'
import { readArtifactShareServingState } from '../store/artifact-share-serving-state'
import { probeArtifactShareIdentity } from './artifact-share-listener'

export function isArtifactShareProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // Why: EPERM proves the pid exists under another user, which still counts as alive.
    return error instanceof Error && 'code' in error && error.code === 'EPERM'
  }
}

export type ArtifactShareServingStatusDeps = {
  isProcessAlive: (pid: number) => boolean
  probeIdentity: (port: number) => Promise<string | null>
}

const defaultDeps: ArtifactShareServingStatusDeps = {
  isProcessAlive: isArtifactShareProcessAlive,
  probeIdentity: probeArtifactShareIdentity
}

/**
 * The status another process on this computer (a relay, or a second Orca) sees. A recorded
 * `serving` only counts when its pid is alive and the port still answers with the same instance,
 * so a crashed app can never be reported as serving.
 */
export async function readArtifactShareServingStatus(
  home: string,
  deps: ArtifactShareServingStatusDeps = defaultDeps
): Promise<ArtifactShareServiceStatus> {
  const state = readArtifactShareServingState(home)
  if (!state || state.state === 'stopped' || !deps.isProcessAlive(state.pid)) {
    return { state: 'orca-not-running' }
  }
  if (state.state === 'sharing-off') {
    return { state: 'sharing-off' }
  }
  if (state.state === 'port-conflict' && state.port !== null) {
    return { state: 'port-conflict', port: state.port }
  }
  if (state.state === 'serving' && state.port !== null && state.ip !== null && state.instance) {
    const instance = await deps.probeIdentity(state.port)
    return instance === state.instance
      ? { state: 'serving', port: state.port, ip: state.ip, ipCandidates: state.ipCandidates }
      : { state: 'orca-not-running' }
  }
  return {
    state: 'failed',
    reason: state.reason ?? 'The share service stopped unexpectedly.',
    logPath: artifactShareLogPath(home)
  }
}
