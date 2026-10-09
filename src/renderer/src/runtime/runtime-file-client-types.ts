import type { GlobalSettings } from '../../../shared/global-settings-types'
import type { LocalFileAccess } from '../../../shared/local-file-access'

export type RuntimeReadableFileContent = {
  mediaUrl?: string
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
  /** File access of the local fallback read; remote reads stay root-relative. */
  access?: LocalFileAccess
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
