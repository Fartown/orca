import { join } from 'node:path'
import { z } from 'zod'
import { writeSecureJsonFile } from '../../shared/secure-file'
import {
  readVersionedArtifactShareFile,
  ARTIFACT_SHARE_FILE_VERSION
} from './store/artifact-share-json-file'

const MAX_KNOWN_HOSTS = 64

const KnownHosts = z.object({
  version: z.number().int(),
  executionHostIds: z.array(z.string().min(1))
})

function knownHostsPath(userDataPath: string): string {
  return join(userDataPath, 'artifact-share-known-hosts.json')
}

/** Remote computers this client shared on, so the Artifacts page can list them while disconnected. */
export function readKnownArtifactShareHosts(userDataPath: string): string[] {
  try {
    return (
      readVersionedArtifactShareFile(knownHostsPath(userDataPath), KnownHosts)?.executionHostIds ??
      []
    )
  } catch {
    return []
  }
}

export function rememberArtifactShareHost(userDataPath: string, executionHostId: string): void {
  if (executionHostId === 'local') {
    return
  }
  const current = readKnownArtifactShareHosts(userDataPath)
  if (current[0] === executionHostId) {
    return
  }
  writeSecureJsonFile(knownHostsPath(userDataPath), {
    version: ARTIFACT_SHARE_FILE_VERSION,
    executionHostIds: [executionHostId, ...current.filter((id) => id !== executionHostId)].slice(
      0,
      MAX_KNOWN_HOSTS
    )
  })
}
