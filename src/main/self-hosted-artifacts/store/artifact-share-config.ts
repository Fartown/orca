import { z } from 'zod'
import { writeDurableSecureJsonFile } from '../../../shared/secure-file'
import { withAgentSessionStoreTransactionLock } from '../../runtime/agent-session-store-transaction-lock'
import {
  ARTIFACT_SHARE_FILE_VERSION,
  readVersionedArtifactShareFile
} from './artifact-share-json-file'
import { artifactShareConfigPath } from './artifact-share-store-layout'

export const ARTIFACT_SHARE_PREFERRED_PORT = 18787

const StoredConfig = z.object({
  version: z.number().int(),
  preferredPort: z.number().int().min(1_024).max(65_535),
  /** Set once a listen succeeded; later starts reuse it so links keep working. */
  confirmedPort: z.number().int().min(1_024).max(65_535).nullable(),
  ip: z.union([z.literal('auto'), z.ipv4()])
})
export type ArtifactShareConfig = z.infer<typeof StoredConfig>

function defaultConfig(): ArtifactShareConfig {
  return {
    version: ARTIFACT_SHARE_FILE_VERSION,
    preferredPort: ARTIFACT_SHARE_PREFERRED_PORT,
    confirmedPort: null,
    ip: 'auto'
  }
}

export function readArtifactShareConfig(home: string): ArtifactShareConfig {
  return (
    readVersionedArtifactShareFile(artifactShareConfigPath(home), StoredConfig) ?? defaultConfig()
  )
}

export function updateArtifactShareConfig(
  home: string,
  patch: Partial<Pick<ArtifactShareConfig, 'preferredPort' | 'confirmedPort' | 'ip'>>
): Promise<ArtifactShareConfig> {
  const path = artifactShareConfigPath(home)
  return withAgentSessionStoreTransactionLock(path, async () => {
    const next = {
      ...(readVersionedArtifactShareFile(path, StoredConfig) ?? defaultConfig()),
      ...patch,
      version: ARTIFACT_SHARE_FILE_VERSION
    }
    writeDurableSecureJsonFile(path, next)
    return next
  })
}
