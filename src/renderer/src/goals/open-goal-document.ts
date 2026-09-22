import { parseExecutionHostId, type ExecutionHostId } from '../../../shared/execution-host'
import { getConnectionIdForFileFromState } from '@/lib/connection-owner-resolution'
import { toWorktreeRelativePath } from '@/lib/terminal-links'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import { requestHostPathGrantForContext } from '@/runtime-host-path/host-path-file-client'
import { resolveAbsoluteTabEntryReach } from '@/runtime-host-path/host-path-grant-seams'
import { statRuntimePath } from '@/runtime/runtime-file-metadata-client'
import { findWorktreeById } from '@/store/slices/worktree-helpers'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

export async function openGoalDocument(
  filePath: string,
  worktreeId: string,
  executionHostId: ExecutionHostId = 'local'
): Promise<void> {
  const host = parseExecutionHostId(executionHostId)
  if (!host) {
    throw new Error('The document execution host is unavailable.')
  }
  if (host.kind === 'local') {
    await window.api.fs.authorizeExternalPath({ targetPath: filePath })
  }
  if (
    !activateAndRevealWorkspace(worktreeId, {
      providesInitialSurface: true,
      executionHostId
    })
  ) {
    throw new Error(
      translate(
        'goals.editor.documentWorkspaceUnavailable',
        'The document workspace could not be opened. Select an available workspace and try again.'
      )
    )
  }
  const state = useAppStore.getState()
  const worktreePath = findWorktreeById(state.worktreesByRepo, worktreeId)?.path ?? null
  // The goal home belongs to the execution host but sits outside the workspace, so a paired host
  // cannot name this document in the worktree-relative form its files.* RPC carries.
  const worktreeRelativePath = worktreePath ? toWorktreeRelativePath(filePath, worktreePath) : null
  const context = {
    settings: state.settings,
    worktreeId,
    worktreePath,
    ...(host.kind === 'ssh' ? { expectedSshTargetId: host.targetId } : {}),
    connectionId: getConnectionIdForFileFromState(state, worktreeId, filePath) ?? undefined
  }
  const reach = await resolveAbsoluteTabEntryReach({
    context,
    filePath,
    worktreeRelativePath,
    requestHostPathGrant: requestHostPathGrantForContext,
    statRuntimePath
  })
  state.openFile(
    {
      filePath: reach.openedPath,
      // Why the absolute path rather than a basename: the editor's reader treats
      // `relativePath === filePath` as "outside the worktree", and that is the only branch that
      // refreshes the client-local grant or reaches the host by grant. A basename would instead be
      // resolved against the workspace root and stat a file that was never there.
      relativePath: worktreeRelativePath ?? reach.openedPath,
      worktreeId,
      language: 'markdown',
      mode: 'markdown-preview',
      readOnly: true,
      runtimeEnvironmentId: host.kind === 'runtime' ? host.environmentId : null,
      ...(host.kind === 'ssh' ? { externalSshTargetId: host.targetId } : {}),
      // Why stamped on the tab: a path outside the worktree is only addressable through its grant,
      // and every later read has to use the same address this open did.
      ...(reach.grant ? { runtimeHostPathGrant: reach.grant } : {})
    },
    { preview: false, suppressActiveRuntimeFallback: true, forceContentReload: true }
  )
}
