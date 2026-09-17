import { resolve } from 'node:path'
import {
  parseRemoteArtifactInput,
  REMOTE_ARTIFACT_INPUT_ENV
} from '../../shared/artifact-cli-bridge'
import { toSshExecutionHostId } from '../../shared/execution-host'
import {
  ORCHESTRATION_COMPATIBILITY_HOST_ID_ENV,
  ORCHESTRATION_COMPATIBILITY_HOST_KIND_ENV
} from '../../shared/orchestration-compatibility-evidence'
import { parseWorkspaceKey } from '../../shared/workspace-scope'
import { splitWorktreeIdForFilesystem } from '../../shared/worktree/id'
import { RuntimeClientError } from '../runtime-client'

export type ArtifactShareCliFileTarget = {
  executionHostId: string
  workspaceRoot?: string
  sourcePath: string
}

function comparablePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
}

/**
 * Same sources the relay uses to pick a terminal's working directory. `ORCA_WORKSPACE_ROOT` is
 * local-only: the SSH CLI bridge does not forward it, so a value here would be this app's own.
 */
function terminalWorkspacePath(env: NodeJS.ProcessEnv, isLocal: boolean): string | undefined {
  const workspaceId = env.ORCA_WORKSPACE_ID?.trim() || env.ORCA_WORKTREE_ID?.trim()
  const scope = workspaceId ? parseWorkspaceKey(workspaceId) : null
  const worktreeId = scope?.type === 'worktree' ? scope.worktreeId : workspaceId
  const worktreePath =
    scope?.type === 'folder' || !worktreeId
      ? undefined
      : splitWorktreeIdForFilesystem(worktreeId)?.worktreePath
  return worktreePath || (isLocal ? env.ORCA_WORKSPACE_ROOT?.trim() : undefined) || undefined
}

/** The terminal's workspace scopes the share like the in-app button does, when it holds the file. */
function terminalWorkspaceRoot(
  env: NodeJS.ProcessEnv,
  target: ArtifactShareCliFileTarget
): string | undefined {
  const { sourcePath } = target
  const root = terminalWorkspacePath(env, target.executionHostId === 'local')
  const comparableRoot = root ? comparablePath(root) : ''
  return root && comparableRoot && comparablePath(sourcePath).startsWith(`${comparableRoot}/`)
    ? root
    : undefined
}

function withWorkspaceRoot(
  env: NodeJS.ProcessEnv,
  target: ArtifactShareCliFileTarget
): ArtifactShareCliFileTarget {
  const workspaceRoot = terminalWorkspaceRoot(env, target)
  return workspaceRoot ? { ...target, workspaceRoot } : target
}

function parseSshSourceKey(sourceKey: string): { targetId: string; path: string } | null {
  try {
    const parsed: unknown = JSON.parse(sourceKey)
    return Array.isArray(parsed) &&
      parsed.length === 3 &&
      parsed[0] === 'ssh' &&
      typeof parsed[1] === 'string' &&
      typeof parsed[2] === 'string'
      ? { targetId: parsed[1], path: parsed[2] }
      : null
  } catch {
    return null
  }
}

/**
 * The computer that runs the command owns the file: a terminal on an SSH host forwards the
 * host-side path, and a local terminal names a local path.
 */
export function resolveArtifactShareCliFileTarget(
  env: NodeJS.ProcessEnv,
  cwd: string,
  file: string | undefined
): ArtifactShareCliFileTarget {
  const remote = parseRemoteArtifactInput(env[REMOTE_ARTIFACT_INPUT_ENV])
  const ssh = remote ? parseSshSourceKey(remote.sourceKey) : null
  if (ssh) {
    return withWorkspaceRoot(env, {
      executionHostId: toSshExecutionHostId(ssh.targetId),
      sourcePath: ssh.path
    })
  }
  if (!file) {
    throw new RuntimeClientError('invalid_argument', 'Missing required file.')
  }
  return withWorkspaceRoot(env, { executionHostId: 'local', sourcePath: resolve(cwd, file) })
}

/** The computer a host-level command (list, service status) is about. */
export function resolveArtifactShareCliHost(env: NodeJS.ProcessEnv): string {
  const hostId = env[ORCHESTRATION_COMPATIBILITY_HOST_ID_ENV]?.trim()
  return env[ORCHESTRATION_COMPATIBILITY_HOST_KIND_ENV] === 'ssh' && hostId
    ? toSshExecutionHostId(hostId)
    : 'local'
}

export function tokenFromArtifactShareLinkOrToken(value: string): string {
  const trimmed = value.trim()
  try {
    const url = new URL(trimmed)
    const token = url.pathname.split('/').find(Boolean)
    if (token) {
      return token
    }
  } catch {
    // Not a URL; treat it as a bare token.
  }
  return trimmed
}
