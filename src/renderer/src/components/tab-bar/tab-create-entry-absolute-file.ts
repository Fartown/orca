import { detectLanguage } from '@/lib/language-detect'
import { isLocalPathOpenBlocked } from '@/lib/local-path-open-guard'
import { toWorktreeRelativePath } from '@/lib/terminal-links'
import type { RuntimeFileOperationArgs, statRuntimePath } from '@/runtime/runtime-file-client'
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
  let stat: Awaited<ReturnType<typeof statRuntimePath>>
  try {
    stat = await args.operations.statRuntimePath(args.context, filePath)
  } catch {
    throw new Error(`File not found: ${filePath}`)
  }
  if (stat.isDirectory) {
    throw new Error(`Cannot open a directory: ${filePath}`)
  }
  args.operations.assertAbsolutePathAllowed()

  const relativePath = toWorktreeRelativePath(filePath, args.worktreePath) || filePath
  const externalSshTargetId =
    relativePath === filePath &&
    !clientLocal &&
    !args.context.settings?.activeRuntimeEnvironmentId?.trim() &&
    args.context.connectionId
      ? args.context.connectionId
      : undefined
  args.operations.openFile(
    {
      filePath,
      relativePath,
      worktreeId: args.worktreeId,
      language: detectLanguage(filePath),
      mode: 'edit',
      // Why: an absolute SSH path outside the worktree otherwise looks identical to a
      // client-local external file when the editor reloads or restores (terminal links stamp it too).
      ...(externalSshTargetId ? { externalSshTargetId } : {})
    },
    { preview: false, targetGroupId: args.groupId }
  )
}
