import { parseExecutionHostId, toSshExecutionHostId } from '../../../../../shared/execution-host'
import type { LanArtifactShareTarget } from '../client/lan-artifact-share-client'
import {
  resolveWorktreeOperationRoute,
  type WorktreeOperationRouteState
} from '@/lib/worktree-operation-route'
import type { OpenFile } from '@/store/slices/editor'

export type LanArtifactShareTargetFailure = 'unknown-host' | 'nested-remote'

export type LanArtifactShareTargetResolution =
  | { ok: true; target: LanArtifactShareTarget }
  | { ok: false; reason: LanArtifactShareTargetFailure }

type HostResolution =
  | { ok: true; executionHostId: string }
  | { ok: false; reason: LanArtifactShareTargetFailure }

function separatorOf(path: string): '/' | '\\' {
  return path.includes('\\') && !path.includes('/') ? '\\' : '/'
}

/**
 * The workspace root is the absolute path minus the workspace-relative path; null when the file
 * sits outside its workspace, so the owning computer scopes the share instead.
 */
export function deriveLanArtifactShareRoot(filePath: string, relativePath: string): string | null {
  const separator = separatorOf(filePath)
  const relative = relativePath.split('/').join(separator)
  const suffix = `${separator}${relative}`
  if (
    !relative ||
    relative.startsWith(separator) ||
    !filePath.endsWith(suffix) ||
    filePath.length <= suffix.length
  ) {
    return null
  }
  const root = filePath.slice(0, filePath.length - suffix.length)
  // Why: `C:\file` keeps its drive root instead of collapsing to the drive-relative `C:`.
  return /^[A-Za-z]:$/.test(root) ? `${root}${separator}` : root
}

function withWorkspaceRoot(
  executionHostId: string,
  sourcePath: string,
  workspaceRoot: string | null
): LanArtifactShareTarget {
  return workspaceRoot
    ? { executionHostId, workspaceRoot, sourcePath }
    : { executionHostId, sourcePath }
}

function hostFromRoute(
  route: { executionHostId: string | null; runtimeEnvironmentId: string | null } | null
): HostResolution {
  const host = route ? parseExecutionHostId(route.executionHostId) : null
  if (!route || !host) {
    return { ok: false, reason: 'unknown-host' }
  }
  if (!route.runtimeEnvironmentId) {
    return { ok: true, executionHostId: host.id }
  }
  // Why: an SSH host behind a paired Orca is two hops away; the paired Orca cannot relay a share.
  return host.kind === 'ssh'
    ? { ok: false, reason: 'nested-remote' }
    : { ok: true, executionHostId: `runtime:${encodeURIComponent(route.runtimeEnvironmentId)}` }
}

export function resolveEditorFileShareTarget(
  state: WorktreeOperationRouteState,
  file: Pick<
    OpenFile,
    'filePath' | 'relativePath' | 'worktreeId' | 'externalSshTargetId' | 'operationProvenance'
  >
): LanArtifactShareTargetResolution {
  const route = file.externalSshTargetId
    ? {
        executionHostId: toSshExecutionHostId(file.externalSshTargetId),
        runtimeEnvironmentId: null
      }
    : (file.operationProvenance?.generation.route ??
      resolveWorktreeOperationRoute(state, file.worktreeId))
  const host = hostFromRoute(route)
  if (!host.ok) {
    return host
  }
  return {
    ok: true,
    target: withWorkspaceRoot(
      host.executionHostId,
      file.filePath,
      file.externalSshTargetId ? null : deriveLanArtifactShareRoot(file.filePath, file.relativePath)
    )
  }
}

/** For surfaces that know the workspace but not an open editor tab (browser pages, doc previews). */
export function resolveWorkspaceFileShareTarget(
  state: WorktreeOperationRouteState,
  input: { worktreeId: string; filePath: string; relativePath: string | null }
): LanArtifactShareTargetResolution {
  const host = hostFromRoute(resolveWorktreeOperationRoute(state, input.worktreeId))
  if (!host.ok) {
    return host
  }
  return {
    ok: true,
    target: withWorkspaceRoot(
      host.executionHostId,
      input.filePath,
      input.relativePath === null
        ? null
        : deriveLanArtifactShareRoot(input.filePath, input.relativePath)
    )
  }
}
