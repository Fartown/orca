import type { FolderWorkspace } from '../../shared/folder-workspace-types'
import { resolveAiVaultSessionTitlesByHost } from '../ipc/ai-vault-session-title-routing'
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
      // Why: follow-mode titles read transcripts through the host-routed
      // resolver; local and ssh:* partitions are all this authority owns.
      resolveSessionTitles: (args) => resolveAiVaultSessionTitlesByHost(args),
      managedSshTargets: { hasTarget: (targetId) => Boolean(options.store.getSshTarget(targetId)) },
      workspaceResolver: createIssueWorkspaceResolver({
        getTerminalWorktreeIdForPaneKey: (paneKey) =>
          options.runtime.getTerminalWorktreeIdForPaneKey(paneKey),
        getFolderWorkspace: (id) => options.store.getFolderWorkspace(id)
      })
    })
  } catch (error) {
    console.error('[issues] feature bootstrap unavailable:', error)
    return null
  }
}
