import { parseExecutionHostId, type ExecutionHostId } from '../../../shared/execution-host'
import { basename } from '@/lib/path'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
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
  useAppStore.getState().openFile(
    {
      filePath,
      relativePath: basename(filePath),
      worktreeId,
      language: 'markdown',
      mode: 'markdown-preview',
      readOnly: true,
      runtimeEnvironmentId: host.kind === 'runtime' ? host.environmentId : null,
      ...(host.kind === 'ssh' ? { externalSshTargetId: host.targetId } : {})
    },
    { preview: false, suppressActiveRuntimeFallback: true, forceContentReload: true }
  )
}
