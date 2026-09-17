import type {
  ArtifactShareFileLink,
  ArtifactShareHostLabel,
  ArtifactShareHostListing,
  ArtifactShareLookupResult,
  ArtifactShareOwnerFileRequest,
  ArtifactShareServiceStatus,
  ArtifactShareShareResult,
  ArtifactShareStatusResult,
  ArtifactSharedWorkspace
} from '../../shared/self-hosted-artifacts/artifact-share-contract'
import {
  ARTIFACT_SHARE_ERROR_CODES,
  ArtifactShareError
} from '../../shared/self-hosted-artifacts/artifact-share-errors'
import {
  buildArtifactShareUrl,
  buildArtifactShareUrlBase
} from '../../shared/self-hosted-artifacts/artifact-share-url'
import {
  resolveArtifactShareOwnerTarget,
  type ArtifactShareOwnerTarget
} from './artifact-share-owner-paths'
import {
  readArtifactShareWorkspaces,
  shareArtifactWorkspaceFile,
  stopArtifactShareWorkspace,
  type StoredArtifactShareWorkspace
} from './store/artifact-share-records'

export type ArtifactShareOwnerService = {
  status: () => Promise<ArtifactShareStatusResult>
  lookup: (request: ArtifactShareOwnerFileRequest) => Promise<ArtifactShareLookupResult>
  share: (request: ArtifactShareOwnerFileRequest) => Promise<ArtifactShareShareResult>
  stopWorkspace: (token: string) => Promise<{ stopped: boolean }>
  list: () => Promise<ArtifactShareHostListing>
}

function serviceUnavailableError(
  status: ArtifactShareServiceStatus,
  label: string
): ArtifactShareError | null {
  switch (status.state) {
    case 'serving':
      return null
    case 'sharing-off':
      return new ArtifactShareError(
        ARTIFACT_SHARE_ERROR_CODES.sharingDisabled,
        `Local network sharing is off on ${label}.`
      )
    case 'port-conflict':
      return new ArtifactShareError(
        ARTIFACT_SHARE_ERROR_CODES.portConflict,
        `Port ${status.port} on ${label} is used by another program.`
      )
    case 'failed':
      return new ArtifactShareError(
        ARTIFACT_SHARE_ERROR_CODES.serveFailed,
        `The share service on ${label} failed: ${status.reason}`
      )
    case 'orca-not-running':
    case 'unverifiable':
      return new ArtifactShareError(
        ARTIFACT_SHARE_ERROR_CODES.orcaNotRunning,
        `Orca isn't open on ${label}.`
      )
  }
}

function toWorkspace(
  stored: StoredArtifactShareWorkspace,
  status: ArtifactShareServiceStatus
): ArtifactSharedWorkspace {
  const serving = status.state === 'serving' ? status : null
  return {
    token: stored.token,
    rootPath: stored.rootPath,
    label: stored.label,
    createdAt: stored.createdAt,
    urlBase: serving
      ? buildArtifactShareUrlBase({ ip: serving.ip, port: serving.port, token: stored.token })
      : null,
    linkedFiles: stored.linkedFiles.map((file) => ({
      ...file,
      url: serving
        ? buildArtifactShareUrl({
            ip: serving.ip,
            port: serving.port,
            token: stored.token,
            relativePath: file.relativePath
          })
        : null
    }))
  }
}

function rootsOf(workspaces: readonly StoredArtifactShareWorkspace[]): string[] {
  return workspaces.map((workspace) => workspace.rootPath)
}

function fileLink(
  workspace: ArtifactSharedWorkspace | null,
  target: ArtifactShareOwnerTarget,
  status: ArtifactShareServiceStatus
): ArtifactShareFileLink {
  const url =
    workspace && status.state === 'serving'
      ? buildArtifactShareUrl({
          ip: status.ip,
          port: status.port,
          token: workspace.token,
          relativePath: target.relativePath
        })
      : null
  return {
    workspace,
    rootPath: target.rootPath,
    workspaceLabel: target.label,
    relativePath: target.relativePath,
    url
  }
}

/** Everything the computer that owns a file answers about sharing it; used in-app and by the relay. */
export function createArtifactShareOwnerService(deps: {
  home: string
  host: ArtifactShareHostLabel
  readStatus: () => Promise<ArtifactShareServiceStatus>
  now?: () => Date
}): ArtifactShareOwnerService {
  const now = deps.now ?? (() => new Date())
  return {
    status: async () => ({ host: deps.host, service: await deps.readStatus() }),
    lookup: async (request) => {
      const workspaces = readArtifactShareWorkspaces(deps.home)
      const [target, service] = await Promise.all([
        resolveArtifactShareOwnerTarget({ ...request, sharedRoots: rootsOf(workspaces) }),
        deps.readStatus()
      ])
      const stored = workspaces.find((workspace) => workspace.rootPath === target.rootPath)
      const workspace = stored ? toWorkspace(stored, service) : null
      return { host: deps.host, service, file: fileLink(workspace, target, service) }
    },
    share: async (request) => {
      const service = await deps.readStatus()
      const unavailable = serviceUnavailableError(service, deps.host.label)
      if (unavailable) {
        throw unavailable
      }
      const target = await resolveArtifactShareOwnerTarget({
        ...request,
        sharedRoots: rootsOf(readArtifactShareWorkspaces(deps.home))
      })
      const { workspace, created } = await shareArtifactWorkspaceFile(deps.home, {
        ...target,
        now: now()
      })
      const shared = toWorkspace(workspace, service)
      return {
        host: deps.host,
        service,
        workspaceCreated: created,
        file: fileLink(shared, target, service)
      }
    },
    stopWorkspace: async (token) => ({
      stopped: await stopArtifactShareWorkspace(deps.home, token)
    }),
    list: async () => {
      const service = await deps.readStatus()
      return {
        host: deps.host,
        service,
        workspaces: readArtifactShareWorkspaces(deps.home).map((workspace) =>
          toWorkspace(workspace, service)
        )
      }
    }
  }
}
