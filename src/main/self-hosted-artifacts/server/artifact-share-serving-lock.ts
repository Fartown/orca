import { mkdir } from 'node:fs/promises'
import { lock } from 'proper-lockfile'
import { artifactShareServingLockTarget } from '../store/artifact-share-store-layout'

export type ArtifactShareServingLockRelease = () => Promise<void>

/**
 * One serving process per computer and OS user. The lock refreshes while held and goes stale
 * shortly after its owner dies, so a crashed Orca does not block the next one for long.
 */
export async function acquireArtifactShareServingLock(
  home: string,
  onCompromised: (error: Error) => void
): Promise<ArtifactShareServingLockRelease | null> {
  await mkdir(home, { recursive: true, mode: 0o700 })
  try {
    return await lock(artifactShareServingLockTarget(home), {
      realpath: false,
      stale: 20_000,
      update: 5_000,
      retries: 0,
      onCompromised
    })
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ELOCKED') {
      return null
    }
    throw error
  }
}
