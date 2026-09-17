import { z } from 'zod'

/** Where the shared file lives, spelled like `src/shared/execution-host.ts`: local | ssh:… | runtime:… */
export const ArtifactShareHostRef = z.object({
  executionHostId: z.string().min(1).max(1_024)
})

const Port = z.number().int().min(1).max(65_535)

/** `unverifiable` is only ever produced by the asking computer when it cannot reach the owner. */
export const ArtifactShareServiceStatus = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('serving'),
    port: Port,
    ip: z.ipv4(),
    ipCandidates: z.array(z.ipv4()),
    /** How this computer picks `ip`; only the app that serves knows it. */
    ipChoice: z.union([z.literal('auto'), z.ipv4()]).optional()
  }),
  z.object({ state: z.literal('sharing-off') }),
  z.object({ state: z.literal('orca-not-running') }),
  z.object({ state: z.literal('port-conflict'), port: Port }),
  z.object({ state: z.literal('failed'), reason: z.string(), logPath: z.string().nullable() }),
  z.object({ state: z.literal('unverifiable'), reason: z.enum(['disconnected', 'host-outdated']) })
])
export type ArtifactShareServiceStatus = z.infer<typeof ArtifactShareServiceStatus>

export const ARTIFACT_SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/
const Token = z.string().regex(ARTIFACT_SHARE_TOKEN_PATTERN)
const HostPath = z.string().min(1).max(32_768)

export const ArtifactShareLinkedFile = z.object({
  relativePath: HostPath,
  lastLinkedAt: z.string(),
  url: z.string().nullable()
})
export type ArtifactShareLinkedFile = z.infer<typeof ArtifactShareLinkedFile>

/** One shared workspace; `urlBase` is null while the owner is not serving. */
export const ArtifactSharedWorkspace = z.object({
  token: Token,
  rootPath: HostPath,
  label: z.string().min(1).max(512),
  createdAt: z.string(),
  urlBase: z.string().nullable(),
  linkedFiles: z.array(ArtifactShareLinkedFile)
})
export type ArtifactSharedWorkspace = z.infer<typeof ArtifactSharedWorkspace>

export const ArtifactShareFileLink = z.object({
  /** Null until the workspace containing the file is shared. */
  workspace: ArtifactSharedWorkspace.nullable(),
  /** The folder a share of this file opens, known before it is shared. */
  rootPath: HostPath,
  workspaceLabel: z.string().min(1).max(512),
  relativePath: HostPath,
  url: z.string().nullable()
})
export type ArtifactShareFileLink = z.infer<typeof ArtifactShareFileLink>

export const ArtifactShareFileRequest = ArtifactShareHostRef.extend({
  /** Omitted when the file is outside any workspace; the owner then picks a shared folder or the file's folder. */
  workspaceRoot: HostPath.optional(),
  sourcePath: HostPath
})
export type ArtifactShareFileRequest = z.infer<typeof ArtifactShareFileRequest>

export const ArtifactShareStopWorkspaceRequest = ArtifactShareHostRef.extend({ token: Token })
export const ArtifactShareListRequest = z.object({
  executionHostIds: z.array(z.string().min(1).max(1_024)).max(64).optional()
})
export const ArtifactShareConfigureLocalRequest = z.object({
  port: z.number().int().min(1_024).max(65_535).optional(),
  ip: z.union([z.literal('auto'), z.ipv4()]).optional()
})
export type ArtifactShareConfigureLocalRequest = z.infer<typeof ArtifactShareConfigureLocalRequest>

export const ArtifactShareHostLabel = z.object({ executionHostId: z.string(), label: z.string() })
export type ArtifactShareHostLabel = z.infer<typeof ArtifactShareHostLabel>

export const ArtifactShareLookupResult = z.object({
  host: ArtifactShareHostLabel,
  service: ArtifactShareServiceStatus,
  file: ArtifactShareFileLink
})
export type ArtifactShareLookupResult = z.infer<typeof ArtifactShareLookupResult>

export const ArtifactShareShareResult = z.object({
  host: ArtifactShareHostLabel,
  service: ArtifactShareServiceStatus,
  workspaceCreated: z.boolean(),
  file: ArtifactShareFileLink
})
export type ArtifactShareShareResult = z.infer<typeof ArtifactShareShareResult>

export const ArtifactShareHostListing = z.object({
  host: ArtifactShareHostLabel,
  service: ArtifactShareServiceStatus,
  workspaces: z.array(ArtifactSharedWorkspace)
})
export type ArtifactShareHostListing = z.infer<typeof ArtifactShareHostListing>

export const ArtifactShareListResult = z.object({ hosts: z.array(ArtifactShareHostListing) })
export type ArtifactShareListResult = z.infer<typeof ArtifactShareListResult>

export const ArtifactShareStatusResult = z.object({
  host: ArtifactShareHostLabel,
  service: ArtifactShareServiceStatus
})
export type ArtifactShareStatusResult = z.infer<typeof ArtifactShareStatusResult>

/** The owner computer answers the same questions without naming itself. */
export const ArtifactShareOwnerFileRequest = ArtifactShareFileRequest.omit({
  executionHostId: true
})
export type ArtifactShareOwnerFileRequest = z.infer<typeof ArtifactShareOwnerFileRequest>

export const ArtifactShareOwnerStopRequest = ArtifactShareStopWorkspaceRequest.omit({
  executionHostId: true
})

export const ARTIFACT_SHARE_RELAY_METHODS = {
  status: 'artifactShare.hostStatus',
  lookup: 'artifactShare.lookup',
  share: 'artifactShare.share',
  stopWorkspace: 'artifactShare.stopWorkspace',
  list: 'artifactShare.list'
} as const
