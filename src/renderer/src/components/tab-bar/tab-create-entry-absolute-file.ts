import { detectLanguage } from '@/lib/language-detect'
import { isLocalPathOpenBlocked } from '@/lib/local-path-open-guard'
import { toWorktreeRelativePath } from '@/lib/terminal-links'
import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client'
import { resolveAbsoluteTabEntryReach } from '../../runtime-host-path/host-path-grant-seams'
import type { OpenFile } from '@/store/slices/editor'
import {
  validateNewTabEntryAbsolutePath,
  type TabEntryLocalPlatform
} from './tab-create-entry-path-validation'
import type { statUserOpenedPath } from '@/lib/user-opened-local-path'

type AbsoluteFileOperations = {
  assertAbsolutePathAllowed: () => void
  openFile: (
    file: Omit<OpenFile, 'id' | 'isDirty'>,
    options?: { preview?: boolean; targetGroupId?: string }
  ) => void
  statUserOpenedPath: typeof statUserOpenedPath
  requestHostPathGrant: (
    context: RuntimeFileOperationArgs,
    absolutePath: string
  ) => Promise<{ grantId: string; absolutePath: string }>
}

export async function openAbsoluteTabEntryFile(args: {
  context: RuntimeFileOperationArgs
  groupId: string
  operations: AbsoluteFileOperations
  filePath: string
  localPlatform: TabEntryLocalPlatform
  worktreeId: string
  worktreePath: string
}): Promise<void> {
  const filePath = validateNewTabEntryAbsolutePath(args.filePath, args.localPlatform)
  args.operations.assertAbsolutePathAllowed()
  const worktreeRelativePath = toWorktreeRelativePath(filePath, args.worktreePath)
  let escapesWorktree = false
  const reach = await resolveAbsoluteTabEntryReach({
    context: args.context,
    filePath,
    worktreeRelativePath,
    requestHostPathGrant: args.operations.requestHostPathGrant,
    statRuntimePath: async (context, path) => {
      const stat = await args.operations.statUserOpenedPath(context, path)
      escapesWorktree = stat.escapesWorktree
      return stat
    }
  })
  args.operations.assertAbsolutePathAllowed()

  const openedPath = reach.openedPath
  // Why: a project link out of the project keeps its absolute path, so it reads as user-named.
  const relativePath = escapesWorktree ? openedPath : worktreeRelativePath || openedPath
  // Why: SSH and paired-runtime paths belong to another machine; only those need an owner stamp.
  const clientLocal = !isLocalPathOpenBlocked(args.context.settings, {
    connectionId: args.context.connectionId
  })
  const externalSshTargetId =
    relativePath === filePath &&
    !clientLocal &&
    !args.context.settings?.activeRuntimeEnvironmentId?.trim() &&
    args.context.connectionId
      ? args.context.connectionId
      : undefined
  args.operations.openFile(
    {
      filePath: openedPath,
      relativePath,
      worktreeId: args.worktreeId,
      language: detectLanguage(openedPath),
      mode: 'edit',
      // Why: an absolute SSH path outside the worktree otherwise looks identical to a
      // client-local external file when the editor reloads or restores (terminal links stamp it too).
      ...(externalSshTargetId ? { externalSshTargetId } : {}),
      // Why stamped on the tab: every later read and save has to address the file the same way
      // this open did, and the grant is the only address it has.
      ...(reach.grant ? { runtimeHostPathGrant: reach.grant } : {})
    },
    { preview: false, targetGroupId: args.groupId }
  )
}
