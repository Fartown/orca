import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import {
  canResumeAiVaultSessionOnTarget,
  getAiVaultResumeWorkspaceExecutionHostId,
  getAiVaultResumeWorkspaceTargetStatus
} from '@/lib/ai-vault-resume-target'
import {
  activateAndRevealFolderWorkspace,
  activateAndRevealWorktree
} from '@/lib/worktree-activation'
import { findWorktreeById } from '@/store/slices/worktree-helpers'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'
import {
  isKnownAiVaultResumeWorkspaceTarget,
  type AiVaultSessionResumeTargetState
} from './ai-vault-session-resume'

export type AiVaultSessionLaunchTarget =
  | { status: 'missing' }
  | {
      status: 'unsupported'
      targetStatus: ReturnType<typeof getAiVaultResumeWorkspaceTargetStatus>
    }
  | { status: 'ready'; worktreeId: string }

export function resolveAiVaultSessionLaunchTarget(args: {
  sessionFilePath: string | null
  sessionExecutionHostId?: AiVaultSession['executionHostId'] | null
  activeWorktreeId: string | null
  targetWorktreeId?: string
  targetState: AiVaultSessionResumeTargetState
}): AiVaultSessionLaunchTarget {
  const targetWorktreeId = args.targetWorktreeId ?? args.activeWorktreeId
  if (
    !targetWorktreeId ||
    !isKnownAiVaultResumeWorkspaceTarget(args.targetState, targetWorktreeId)
  ) {
    return { status: 'missing' }
  }

  const targetStatus = getAiVaultResumeWorkspaceTargetStatus(args.targetState, targetWorktreeId)
  const targetExecutionHostId = getAiVaultResumeWorkspaceExecutionHostId(
    args.targetState,
    targetWorktreeId
  )
  if (
    !canResumeAiVaultSessionOnTarget({
      sessionFilePath: args.sessionFilePath,
      sessionExecutionHostId: args.sessionExecutionHostId,
      targetStatus,
      targetExecutionHostId
    })
  ) {
    return { status: 'unsupported', targetStatus }
  }

  return { status: 'ready', worktreeId: targetWorktreeId }
}

export function resolveAiVaultSessionLaunchTargetOrNotify(
  args: Parameters<typeof resolveAiVaultSessionLaunchTarget>[0]
): Extract<AiVaultSessionLaunchTarget, { status: 'ready' }> | null {
  const target = resolveAiVaultSessionLaunchTarget(args)
  if (target.status === 'missing') {
    toast.error(
      translate(
        'auto.components.right.sidebar.AiVaultPanel.openWorkspaceBeforeResuming',
        'Open a workspace before resuming a session.'
      )
    )
    return null
  }
  if (target.status === 'unsupported') {
    toast.error(aiVaultResumeUnsupportedMessage(target.targetStatus))
    return null
  }
  return target
}

export function resolveAiVaultTargetWorkspacePath(
  state: AiVaultSessionResumeTargetState,
  workspaceId: string
): string | null {
  const scope = parseWorkspaceKey(workspaceId)
  if (scope?.type === 'folder') {
    return (
      state.folderWorkspaces.find((workspace) => workspace.id === scope.folderWorkspaceId)
        ?.folderPath ?? null
    )
  }
  const worktreeId = scope?.type === 'worktree' ? scope.worktreeId : workspaceId
  return findWorktreeById(state.worktreesByRepo, worktreeId)?.path ?? null
}

export function activateAiVaultResumeWorkspace(workspaceId: string): void {
  const workspaceScope = parseWorkspaceKey(workspaceId)
  if (workspaceScope?.type === 'folder') {
    activateAndRevealFolderWorkspace(workspaceScope.folderWorkspaceId)
    return
  }
  activateAndRevealWorktree(workspaceId)
}

export function workspaceScopeForIssueResume(workspaceId: string) {
  return parseWorkspaceKey(workspaceId) ?? { type: 'worktree' as const, worktreeId: workspaceId }
}

export function workspaceDisplayName(
  state: AiVaultSessionResumeTargetState,
  workspaceId: string
): string {
  const scope = parseWorkspaceKey(workspaceId)
  if (scope?.type === 'folder') {
    return (
      state.folderWorkspaces.find((workspace) => workspace.id === scope.folderWorkspaceId)?.name ??
      scope.folderWorkspaceId
    )
  }
  const worktreeId = scope?.type === 'worktree' ? scope.worktreeId : workspaceId
  return findWorktreeById(state.worktreesByRepo, worktreeId)?.displayName ?? worktreeId
}

function aiVaultResumeUnsupportedMessage(
  targetStatus: ReturnType<typeof getAiVaultResumeWorkspaceTargetStatus>
): string {
  if (targetStatus === 'ssh' || targetStatus === 'local' || targetStatus === 'runtime') {
    return translate(
      'auto.components.right.sidebar.AiVaultPanel.sessionHostMismatchUnsupported',
      'This session belongs to a different host. Open a workspace on the same host to resume it.'
    )
  }
  return translate(
    'auto.components.right.sidebar.AiVaultPanel.openSupportedWorkspace',
    'Open a workspace before resuming a session.'
  )
}
