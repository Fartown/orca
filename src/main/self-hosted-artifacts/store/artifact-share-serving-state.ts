import { z } from 'zod'
import { writeSecureJsonFile } from '../../../shared/secure-file'
import {
  ARTIFACT_SHARE_FILE_VERSION,
  readVersionedArtifactShareFile
} from './artifact-share-json-file'
import { artifactShareServingStatePath } from './artifact-share-store-layout'

const ServingState = z.object({
  version: z.number().int(),
  state: z.enum(['serving', 'sharing-off', 'port-conflict', 'failed', 'stopped']),
  pid: z.number().int(),
  /** Random per listen; the identity endpoint echoes it so a stale pid cannot impersonate a server. */
  instance: z.string().nullable(),
  port: z.number().int().nullable(),
  ip: z.ipv4().nullable(),
  ipCandidates: z.array(z.ipv4()),
  reason: z.string().nullable(),
  updatedAt: z.string()
})
export type ArtifactShareServingState = z.infer<typeof ServingState>

export function readArtifactShareServingState(home: string): ArtifactShareServingState | null {
  return readVersionedArtifactShareFile(artifactShareServingStatePath(home), ServingState)
}

/** Written only by the process that holds the serving lock, so it needs no transaction lock of its own. */
export function writeArtifactShareServingState(
  home: string,
  state: Omit<ArtifactShareServingState, 'version' | 'updatedAt'>,
  now: Date = new Date()
): void {
  writeSecureJsonFile(artifactShareServingStatePath(home), {
    ...state,
    version: ARTIFACT_SHARE_FILE_VERSION,
    updatedAt: now.toISOString()
  })
}
