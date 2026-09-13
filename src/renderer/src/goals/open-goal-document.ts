import { basename } from '@/lib/path'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

export async function openGoalDocument(filePath: string, worktreeId: string): Promise<void> {
  await window.api.fs.authorizeExternalPath({ targetPath: filePath })
  if (
    !activateAndRevealWorkspace(worktreeId, {
      providesInitialSurface: true,
      executionHostId: 'local'
    })
  ) {
    throw new Error(
      translate(
        'goals.editor.documentWorkspaceUnavailable',
        'The document workspace could not be opened. Select an available workspace and try again.'
      )
    )
  }
  // Goal drafts belong to the local host even when another runtime is selected.
  useAppStore.getState().openFile(
    {
      filePath,
      relativePath: basename(filePath),
      worktreeId,
      language: 'markdown',
      mode: 'markdown-preview',
      readOnly: true,
      runtimeEnvironmentId: null
    },
    { preview: false, suppressActiveRuntimeFallback: true, forceContentReload: true }
  )
}
