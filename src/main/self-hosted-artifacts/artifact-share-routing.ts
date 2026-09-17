import type { z } from 'zod'
import { parseExecutionHostId } from '../../shared/execution-host'
import type { ARTIFACT_SHARE_RELAY_METHODS } from '../../shared/self-hosted-artifacts/artifact-share-contract'
import {
  ARTIFACT_SHARE_ERROR_CODES,
  ArtifactShareError,
  ArtifactShareRelayEnvelope,
  artifactShareErrorFromEnvelope,
  isArtifactShareErrorCode
} from '../../shared/self-hosted-artifacts/artifact-share-errors'
import { getActiveMultiplexer, listRegisteredSshTargets } from '../ssh/ssh-target-registry'
import type { ArtifactShareRuntimeEnvironmentCall } from './artifact-share-runtime-registry'

type ArtifactShareOwnerMethod =
  (typeof ARTIFACT_SHARE_RELAY_METHODS)[keyof typeof ARTIFACT_SHARE_RELAY_METHODS]

const OWNER_REQUEST_TIMEOUT_MS = 20_000
const JSON_RPC_METHOD_NOT_FOUND = -32601

export type ArtifactShareCallerContext = {
  clientKind?: 'mobile' | 'runtime'
  pairedDeviceId?: string
}

export function artifactShareSshTargetLabel(targetId: string): string {
  return listRegisteredSshTargets().find((target) => target.id === targetId)?.label ?? targetId
}

function unreachable(label: string): ArtifactShareError {
  return new ArtifactShareError(ARTIFACT_SHARE_ERROR_CODES.hostUnreachable, `Can't reach ${label}.`)
}

function outdated(label: string): ArtifactShareError {
  return new ArtifactShareError(
    ARTIFACT_SHARE_ERROR_CODES.hostOutdated,
    `Orca on ${label} needs an update to share files.`
  )
}

async function callOverSsh<T>(
  targetId: string,
  method: ArtifactShareOwnerMethod,
  params: Record<string, unknown>,
  resultSchema: z.ZodType<T>
): Promise<T> {
  const label = artifactShareSshTargetLabel(targetId)
  let mux: ReturnType<typeof getActiveMultiplexer>
  try {
    mux = getActiveMultiplexer(targetId)
  } catch {
    throw unreachable(label)
  }
  if (!mux) {
    throw unreachable(label)
  }
  let raw: unknown
  try {
    raw = await mux.request(method, params, { timeoutMs: OWNER_REQUEST_TIMEOUT_MS })
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === JSON_RPC_METHOD_NOT_FOUND) {
      throw outdated(label)
    }
    throw unreachable(label)
  }
  const envelope = ArtifactShareRelayEnvelope.parse(raw)
  if (!envelope.ok) {
    throw artifactShareErrorFromEnvelope(envelope)
  }
  return resultSchema.parse(envelope.value)
}

export type ArtifactShareRuntimeEnvironmentAccess = {
  userDataPath: string
  call: ArtifactShareRuntimeEnvironmentCall
}

async function callOverRuntime<T>(
  runtimeEnvironment: ArtifactShareRuntimeEnvironmentAccess,
  environmentId: string,
  method: ArtifactShareOwnerMethod,
  params: Record<string, unknown>,
  resultSchema: z.ZodType<T>
): Promise<T> {
  let response: Awaited<ReturnType<ArtifactShareRuntimeEnvironmentCall>>
  try {
    response = await runtimeEnvironment.call(
      runtimeEnvironment.userDataPath,
      environmentId,
      method,
      { ...params, executionHostId: 'local' },
      OWNER_REQUEST_TIMEOUT_MS
    )
  } catch {
    throw unreachable(environmentId)
  }
  if (response.ok) {
    return resultSchema.parse(response.result)
  }
  if (response.error.code === 'method_not_found') {
    throw outdated(environmentId)
  }
  throw isArtifactShareErrorCode(response.error.code)
    ? new ArtifactShareError(response.error.code, response.error.message)
    : new Error(response.error.message)
}

/**
 * Sends a sharing question to the computer that owns the file. Failures never fall back to this
 * computer: a disconnected owner is reported as unreachable, not answered locally.
 */
export function routeArtifactShareCall<T>(input: {
  executionHostId: string
  method: ArtifactShareOwnerMethod
  params: Record<string, unknown>
  resultSchema: z.ZodType<T>
  local: () => Promise<T>
  context: ArtifactShareCallerContext
  /** Resolved only for a paired Orca, so SSH and local calls never need the desktop transport. */
  runtimeEnvironment: () => ArtifactShareRuntimeEnvironmentAccess
}): Promise<T> {
  const host = parseExecutionHostId(input.executionHostId)
  if (!host) {
    return Promise.reject(
      new ArtifactShareError(
        ARTIFACT_SHARE_ERROR_CODES.unsupportedHost,
        'Unknown computer for this file.'
      )
    )
  }
  if (host.kind === 'local') {
    return input.local()
  }
  if (input.context.clientKind === 'runtime' && input.context.pairedDeviceId !== undefined) {
    return Promise.reject(
      new ArtifactShareError(
        ARTIFACT_SHARE_ERROR_CODES.unsupportedHost,
        'A paired Orca cannot share files through a second remote computer.'
      )
    )
  }
  if (host.kind === 'ssh') {
    return callOverSsh(host.targetId, input.method, input.params, input.resultSchema)
  }
  return callOverRuntime(
    input.runtimeEnvironment(),
    host.environmentId,
    input.method,
    input.params,
    input.resultSchema
  )
}
