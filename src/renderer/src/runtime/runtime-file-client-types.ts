import type { GlobalSettings } from '../../../shared/global-settings-types'

export type RuntimeReadableFileContent = {
  content: string
  isBinary: boolean
  isImage?: boolean
  mimeType?: string
  fileIdentity?: string
}

/** A host file outside the worktree, addressed by the grant the host minted for it. */
export type RuntimeHostPathGrantRef = { grantId: string; absolutePath: string }

export type RuntimeFileReadArgs = {
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined
  filePath: string
  relativePath?: string
  worktreeId?: string
  connectionId?: string
  expectedExternalSshTargetId?: string
  includeLocalLogMetadata?: boolean
  hostPathGrant?: RuntimeHostPathGrantRef
}

export type RuntimeFileOperationArgs = {
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined
  worktreeId: string | null | undefined
  worktreePath: string | null | undefined
  connectionId?: string
  expectedExecutionHostId?: 'local' | `ssh:${string}`
  expectedSshTargetId?: string
  expectedSshConnectionGeneration?: number
  expectedExternalSshTargetId?: string
  hostPathGrant?: RuntimeHostPathGrantRef
}

export type RuntimeFileDownloadResult =
  | { canceled: true }
  | { canceled: false; destinationPath: string }
