import { readFileSync } from 'node:fs'
import type { z } from 'zod'
import {
  ARTIFACT_SHARE_ERROR_CODES,
  ArtifactShareError
} from '../../../shared/self-hosted-artifacts/artifact-share-errors'

export const ARTIFACT_SHARE_FILE_VERSION = 1

/**
 * Reads one versioned JSON file. Missing → null. A newer version is refused so an older Orca
 * never rewrites a format it does not understand.
 */
export function readVersionedArtifactShareFile<T>(path: string, schema: z.ZodType<T>): T | null {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null
    }
    throw error
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`Artifact share file is not valid JSON: ${path}`)
  }
  const version =
    parsed !== null && typeof parsed === 'object' && 'version' in parsed ? parsed.version : null
  if (typeof version === 'number' && version > ARTIFACT_SHARE_FILE_VERSION) {
    throw new ArtifactShareError(
      ARTIFACT_SHARE_ERROR_CODES.hostOutdated,
      'Artifact sharing on this computer was written by a newer Orca. Update Orca to change it.'
    )
  }
  const result = schema.safeParse(parsed)
  if (!result.success) {
    throw new Error(`Artifact share file has an unsupported shape: ${path}`)
  }
  return result.data
}
