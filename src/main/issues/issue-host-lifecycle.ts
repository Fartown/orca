import type { AgentSessionIdentityPathAccess } from '../runtime/agent-session-claim-identity'
import { getLocalWorktreeCanonicalPathAccess } from '../local-worktree-filesystem'
import { getSshFilesystemProvider } from '../providers/ssh-filesystem-dispatch'
import type { FolderWorkspace } from '../../shared/folder-workspace-types'
import type { IssueAgentHookSource } from './issue-feature-bootstrap'
import { IssueFeatureBootstrap } from './issue-feature-bootstrap'
import type { IssueFeatureReadinessRegistry } from './issue-feature-readiness'
import { issueFeatureReadinessRegistry } from './issue-feature-readiness'
import { createIssueWorkspaceResolver } from './issue-workspace-resolver'

export type IssueHostLifecycleRuntime = {
  getTerminalWorktreeIdForPaneKey(paneKey: string): string | null
}

export type IssueHostLifecycleStore = {
  getFolderWorkspace(id: string): FolderWorkspace | undefined
  getSshTarget(id: string): unknown
  getSettings(): { terminalWindowsWslDistro?: string | null }
}

export type StartIssueFeatureForHostOptions = {
  profileId: string
  profileLabel: string
  userDataPath: string
  runtime: IssueHostLifecycleRuntime
  store: IssueHostLifecycleStore
  hookSource: IssueAgentHookSource | null
  hookEvidenceStatus: 'ready' | 'disabled' | 'failed'
  readinessRegistry?: IssueFeatureReadinessRegistry
}

export async function startIssueFeatureForHost(
  options: StartIssueFeatureForHostOptions
): Promise<IssueFeatureBootstrap | null> {
  const readiness = options.readinessRegistry ?? issueFeatureReadinessRegistry
  try {
    return await IssueFeatureBootstrap.create({
      profileId: options.profileId,
      profileLabel: options.profileLabel,
      userDataPath: options.userDataPath,
      hookSource: options.hookSource,
      hookEvidenceStatus: options.hookEvidenceStatus,
      readinessRegistry: readiness,
      managedSshTargets: { hasTarget: (targetId) => Boolean(options.store.getSshTarget(targetId)) },
      workspaceResolver: createIssueWorkspaceResolver({
        getTerminalWorktreeIdForPaneKey: (paneKey) =>
          options.runtime.getTerminalWorktreeIdForPaneKey(paneKey),
        getFolderWorkspace: (id) => options.store.getFolderWorkspace(id),
        hostPlatform: (connectionId, workspacePath) =>
          inferHostPlatform(connectionId, workspacePath),
        pathAccess: (connectionId, hostPlatform) =>
          pathAccess(options.store, connectionId, hostPlatform)
      })
    })
  } catch (error) {
    console.error('[issues] feature bootstrap unavailable:', error)
    return null
  }
}

function pathAccess(
  store: IssueHostLifecycleStore,
  connectionId: string | null,
  hostPlatform: NodeJS.Platform
): AgentSessionIdentityPathAccess | null {
  if (connectionId) {
    const provider = getSshFilesystemProvider(connectionId)
    return provider
      ? {
          platform: hostPlatform,
          realpath: (path) => provider.realpath(path),
          stat: (path) => provider.stat(path)
        }
      : null
  }
  return getLocalWorktreeCanonicalPathAccess({
    wslDistro:
      hostPlatform === 'linux'
        ? (store.getSettings().terminalWindowsWslDistro ?? undefined)
        : undefined
  })
}

function inferHostPlatform(connectionId: string | null, workspacePath: string): NodeJS.Platform {
  if (/^[a-zA-Z]:[\\/]/.test(workspacePath) || workspacePath.startsWith('\\\\')) {
    return 'win32'
  }
  if (connectionId) {
    return 'linux'
  }
  return process.platform === 'win32' && workspacePath.startsWith('/') ? 'linux' : process.platform
}
