import type { TransferOrcaProfileProjectArgs } from '../../shared/orca-profiles'
import {
  ProfileIssueProjectMoveGuard,
  type IssueProjectMoveGuard
} from '../issues/issue-project-move-guard'

export type { IssueProjectMoveGuard } from '../issues/issue-project-move-guard'

export function parseOrcaProfileProjectTransferArgs(args: unknown): TransferOrcaProfileProjectArgs {
  if (!args || typeof args !== 'object') {
    throw new Error('invalid_orca_profile_project_transfer')
  }
  const candidate = args as TransferOrcaProfileProjectArgs
  const sourceProfileId = candidate.sourceProfileId?.trim()
  const targetProfileId = candidate.targetProfileId?.trim()
  const repoId = candidate.repoId?.trim()
  const mode = candidate.mode
  if (!sourceProfileId || !targetProfileId || !repoId || (mode !== 'move' && mode !== 'copy')) {
    throw new Error('invalid_orca_profile_project_transfer')
  }
  return { sourceProfileId, targetProfileId, repoId, mode }
}

export function assertOrcaProfileProjectMoveAllowed(
  args: TransferOrcaProfileProjectArgs,
  userDataPath: string,
  guard?: IssueProjectMoveGuard
): void {
  if (args.mode !== 'move') {
    return
  }
  const managed = (
    guard ?? new ProfileIssueProjectMoveGuard(userDataPath)
  ).findManagedConversationsForRepo({
    profileId: args.sourceProfileId,
    repoId: args.repoId
  })
  if (managed.length === 0) {
    return
  }
  const preview = managed
    .slice(0, 3)
    .map((conversation) => conversation.title ?? conversation.conversationId)
    .join(', ')
  throw new Error(`issue_project_move_blocked:${managed.length}:${preview}`)
}
