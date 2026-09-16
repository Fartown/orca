import { detectLanguage } from '@/lib/language-detect'
import { isLocalPathOpenBlocked } from '@/lib/local-path-open-guard'
import { toWorktreeRelativePath } from '@/lib/terminal-links'
import type { RuntimeFileOperationArgs, statRuntimePath } from '@/runtime/runtime-file-client'
import { resolveAbsoluteTabEntryReach } from '../../runtime-host-path/host-path-grant-seams'
import type { OpenFile } from '@/store/slices/editor'
import {
  validateNewTabEntryAbsolutePath,
  type TabEntryLocalPlatform
} from './tab-create-entry-path-validation'

type AbsoluteFileOperations = {
  assertAbsolutePathAllowed: () => void
  authorizeExternalPath: (args: { targetPath: string }) => Promise<void>
  openFile: (
    file: Omit<OpenFile, 'id' | 'isDirty'>,
    options?: { preview?: boolean; targetGroupId?: string }
  ) => void
  statRuntimePath: typeof statRuntimePath
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
  // Why: only client-local paths need the main-process grant. SSH and paired-runtime paths
  // belong to another machine, whose relay/runtime is the security boundary (same rule as
  // terminal file links); granting them here would authorize a same-named local path instead.
  const clientLocal = !isLocalPathOpenBlocked(args.context.settings, {
    connectionId: args.context.connectionId
  })
  if (clientLocal) {
    await args.operations.authorizeExternalPath({ targetPath: filePath })
    args.operations.assertAbsolutePathAllowed()
  }
  const worktreeRelativePath = toWorktreeRelativePath(filePath, args.worktreePath)
  const reach = await resolveAbsoluteTabEntryReach({
    ...args.operations,
    context: args.context,
    filePath,
    worktreeRelativePath
  })
  args.operations.assertAbsolutePathAllowed()

  const openedPath = reach.openedPath
  const relativePath = worktreeRelativePath || openedPath
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
