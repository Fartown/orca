import { z } from 'zod'
import { ARTIFACT_SHARING_DISABLED_CODE } from '../artifact-sharing-gate'

export const ARTIFACT_SHARE_ERROR_CODES = {
  sharingDisabled: ARTIFACT_SHARING_DISABLED_CODE,
  hostUnreachable: 'artifact_share_host_unreachable',
  hostOutdated: 'artifact_share_host_outdated',
  orcaNotRunning: 'artifact_share_orca_not_running',
  portConflict: 'artifact_share_port_conflict',
  serveFailed: 'artifact_share_serve_failed',
  pathDenied: 'artifact_share_path_denied',
  notFound: 'artifact_share_not_found',
  unsupportedHost: 'artifact_share_unsupported_host'
} as const

export type ArtifactShareErrorCode =
  (typeof ARTIFACT_SHARE_ERROR_CODES)[keyof typeof ARTIFACT_SHARE_ERROR_CODES]

const ERROR_CODE_VALUES: ReadonlySet<unknown> = new Set(Object.values(ARTIFACT_SHARE_ERROR_CODES))

export function isArtifactShareErrorCode(value: unknown): value is ArtifactShareErrorCode {
  return ERROR_CODE_VALUES.has(value)
}

export class ArtifactShareError extends Error {
  constructor(
    readonly code: ArtifactShareErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'ArtifactShareError'
  }
}

/**
 * Why a result envelope over the relay: a relay error keeps only its message, so a string code
 * thrown on the owner would reach the asking computer as a generic failure.
 */
export const ArtifactShareRelayEnvelope = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), value: z.unknown() }),
  z.object({ ok: z.literal(false), code: z.string(), message: z.string() })
])
export type ArtifactShareRelayEnvelope = z.infer<typeof ArtifactShareRelayEnvelope>

export function artifactShareErrorFromEnvelope(
  envelope: Extract<ArtifactShareRelayEnvelope, { ok: false }>
): Error {
  return isArtifactShareErrorCode(envelope.code)
    ? new ArtifactShareError(envelope.code, envelope.message)
    : new Error(envelope.message)
}
