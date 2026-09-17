import { z } from 'zod'
import { listEnvironments } from '../../../../shared/runtime-environment-store'
import {
  ARTIFACT_SHARE_RELAY_METHODS,
  ArtifactShareConfigureLocalRequest,
  ArtifactShareFileRequest,
  ArtifactShareHostListing,
  ArtifactShareHostRef,
  ArtifactShareListRequest,
  ArtifactShareLookupResult,
  ArtifactShareShareResult,
  ArtifactShareStatusResult,
  ArtifactShareStopWorkspaceRequest,
  type ArtifactShareHostLabel,
  type ArtifactShareListResult
} from '../../../../shared/self-hosted-artifacts/artifact-share-contract'
import {
  ARTIFACT_SHARE_ERROR_CODES,
  ArtifactShareError
} from '../../../../shared/self-hosted-artifacts/artifact-share-errors'
import { requireArtifactShareRuntime } from '../../../self-hosted-artifacts/artifact-share-runtime-registry'
import {
  readKnownArtifactShareHosts,
  rememberArtifactShareHost
} from '../../../self-hosted-artifacts/artifact-share-known-hosts'
import {
  artifactShareSshTargetLabel,
  routeArtifactShareCall,
  type ArtifactShareCallerContext,
  type ArtifactShareRuntimeEnvironmentAccess
} from '../../../self-hosted-artifacts/artifact-share-routing'
import {
  isRuntimeOwnedSshTargetId,
  parseExecutionHostId,
  toSshExecutionHostId
} from '../../../../shared/execution-host'
import { getActiveMultiplexer, listRegisteredSshTargets } from '../../../ssh/ssh-target-registry'
import { defineMethod } from '../core'

const StopResult = z.object({ stopped: z.boolean() })

/** Owner answers name themselves; the asking computer knows them by the label the user chose. */
function hostLabelFor(
  executionHostId: string,
  reported: ArtifactShareHostLabel
): ArtifactShareHostLabel {
  const host = parseExecutionHostId(executionHostId)
  if (!host || host.kind === 'local') {
    return reported
  }
  if (host.kind === 'ssh') {
    return { executionHostId, label: artifactShareSshTargetLabel(host.targetId) }
  }
  const runtime = requireArtifactShareRuntime()
  const environment = listEnvironments(runtime.userDataPath).find(
    (entry) => entry.id === host.environmentId
  )
  return { executionHostId, label: environment?.name ?? reported.label }
}

function runtimeEnvironmentAccess(): ArtifactShareRuntimeEnvironmentAccess {
  const runtime = requireArtifactShareRuntime()
  return { userDataPath: runtime.userDataPath, call: runtime.callRuntimeEnvironment }
}

function route<T extends { host: ArtifactShareHostLabel }>(
  executionHostId: string,
  method: (typeof ARTIFACT_SHARE_RELAY_METHODS)[keyof typeof ARTIFACT_SHARE_RELAY_METHODS],
  params: Record<string, unknown>,
  schema: z.ZodType<T>,
  local: () => Promise<T>,
  context: ArtifactShareCallerContext
): Promise<T> {
  return routeArtifactShareCall({
    executionHostId,
    method,
    params,
    resultSchema: schema,
    local,
    context,
    runtimeEnvironment: runtimeEnvironmentAccess
  }).then((result) => ({ ...result, host: hostLabelFor(executionHostId, result.host) }))
}

function isConnectedSshTarget(targetId: string): boolean {
  try {
    return getActiveMultiplexer(targetId) !== undefined
  } catch {
    return false
  }
}

async function listHost(
  executionHostId: string,
  context: ArtifactShareCallerContext
): Promise<ArtifactShareHostListing> {
  const owner = () => requireArtifactShareRuntime().owner
  try {
    return await route(
      executionHostId,
      ARTIFACT_SHARE_RELAY_METHODS.list,
      {},
      ArtifactShareHostListing,
      () => owner().list(),
      context
    )
  } catch (error) {
    const outdated =
      error instanceof ArtifactShareError && error.code === ARTIFACT_SHARE_ERROR_CODES.hostOutdated
    return {
      host: hostLabelFor(executionHostId, { executionHostId, label: executionHostId }),
      service: { state: 'unverifiable', reason: outdated ? 'host-outdated' : 'disconnected' },
      workspaces: []
    }
  }
}

/** This computer, connected SSH hosts, and hosts shared to before; a paired caller sees only this computer. */
export async function listArtifactShareHosts(
  params: z.infer<typeof ArtifactShareListRequest>,
  context: ArtifactShareCallerContext
): Promise<ArtifactShareListResult> {
  const paired = context.clientKind === 'runtime' && context.pairedDeviceId !== undefined
  const ids =
    params.executionHostIds ??
    (paired
      ? ['local']
      : [
          'local',
          ...listRegisteredSshTargets()
            .filter(
              (target) => !isRuntimeOwnedSshTargetId(target.id) && isConnectedSshTarget(target.id)
            )
            .map((target) => toSshExecutionHostId(target.id)),
          ...readKnownArtifactShareHosts(requireArtifactShareRuntime().userDataPath)
        ])
  const unique = [...new Set(ids)]
  return { hosts: await Promise.all(unique.map((id) => listHost(id, context))) }
}

export const ARTIFACT_SHARE_METHODS = [
  defineMethod({
    name: 'artifactShare.hostStatus',
    params: ArtifactShareHostRef,
    handler: (params, context) =>
      route(
        params.executionHostId,
        ARTIFACT_SHARE_RELAY_METHODS.status,
        {},
        ArtifactShareStatusResult,
        () => requireArtifactShareRuntime().owner.status(),
        context
      )
  }),
  defineMethod({
    name: 'artifactShare.lookup',
    params: ArtifactShareFileRequest,
    handler: ({ executionHostId, ...request }, context) =>
      route(
        executionHostId,
        ARTIFACT_SHARE_RELAY_METHODS.lookup,
        request,
        ArtifactShareLookupResult,
        () => requireArtifactShareRuntime().owner.lookup(request),
        context
      )
  }),
  defineMethod({
    name: 'artifactShare.share',
    params: ArtifactShareFileRequest,
    handler: async ({ executionHostId, ...request }, context) => {
      const result = await route(
        executionHostId,
        ARTIFACT_SHARE_RELAY_METHODS.share,
        request,
        ArtifactShareShareResult,
        () => requireArtifactShareRuntime().owner.share(request),
        context
      )
      rememberArtifactShareHost(requireArtifactShareRuntime().userDataPath, executionHostId)
      return result
    }
  }),
  defineMethod({
    name: 'artifactShare.stopWorkspace',
    params: ArtifactShareStopWorkspaceRequest,
    handler: ({ executionHostId, token }, context) =>
      routeArtifactShareCall({
        executionHostId,
        method: ARTIFACT_SHARE_RELAY_METHODS.stopWorkspace,
        params: { token },
        resultSchema: StopResult,
        local: () => requireArtifactShareRuntime().owner.stopWorkspace(token),
        context,
        runtimeEnvironment: runtimeEnvironmentAccess
      })
  }),
  defineMethod({
    name: 'artifactShare.list',
    params: ArtifactShareListRequest,
    handler: (params, context) => listArtifactShareHosts(params, context)
  }),
  defineMethod({
    name: 'artifactShare.configureLocal',
    params: ArtifactShareConfigureLocalRequest,
    handler: async (params) => {
      const runtime = requireArtifactShareRuntime()
      await runtime.configureLocal(params)
      return runtime.owner.status()
    }
  })
]
