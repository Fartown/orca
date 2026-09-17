import { useCallback } from 'react'
import { useAppStore } from '@/store'
import { findWorktreeById } from '@/store/slices/worktree-helpers'
import type { OpenFile } from '@/store/slices/editor'
import type { DocPreviewDocumentIdentity } from '@/components/browser-pane/workspace-doc/doc-preview-document-identity'
import {
  resolveEditorFileShareTarget,
  resolveWorkspaceFileShareTarget
} from './lan-artifact-share-target'
import { LanArtifactShareButton } from './LanArtifactShareButton'

/** Markdown editor header: the open tab already knows which computer owns the file. */
export function EditorFileLanShareButton({
  file,
  className
}: {
  file: OpenFile
  className?: string
}): React.JSX.Element {
  const resolveTarget = useCallback(
    () => resolveEditorFileShareTarget(useAppStore.getState(), file),
    [file]
  )
  return (
    <LanArtifactShareButton
      resolveTarget={resolveTarget}
      hasUnsavedChanges={file.isDirty}
      className={className}
    />
  )
}

function relativeInside(root: string, filePath: string): string | null {
  const separator = root.includes('\\') && !root.includes('/') ? '\\' : '/'
  const prefix = root.endsWith(separator) ? root : `${root}${separator}`
  return filePath.startsWith(prefix)
    ? filePath.slice(prefix.length).split(separator).join('/')
    : null
}

/** A `file:` page in the browser pane is always a file on this computer. */
export function BrowserFileLanShareButton({
  worktreeId,
  filePath,
  className
}: {
  worktreeId: string
  filePath: string
  className?: string
}): React.JSX.Element {
  const resolveTarget = useCallback(() => {
    const worktree = findWorktreeById(useAppStore.getState().worktreesByRepo, worktreeId)
    const relativePath = worktree ? relativeInside(worktree.path, filePath) : null
    return {
      ok: true as const,
      target:
        worktree && relativePath !== null
          ? { executionHostId: 'local', workspaceRoot: worktree.path, sourcePath: filePath }
          : { executionHostId: 'local', sourcePath: filePath }
    }
  }, [filePath, worktreeId])
  return <LanArtifactShareButton resolveTarget={resolveTarget} className={className} />
}

/** Workspace HTML document preview: shares from whichever computer owns the workspace. */
export function DocPreviewLanShareButton({
  worktreeId,
  identity,
  className
}: {
  worktreeId: string
  identity: DocPreviewDocumentIdentity
  className?: string
}): React.JSX.Element {
  const resolveTarget = useCallback(
    () =>
      resolveWorkspaceFileShareTarget(useAppStore.getState(), {
        worktreeId,
        filePath: identity.absolutePath,
        relativePath: `${identity.directoryPrefix}${identity.fileName}`
      }),
    [identity, worktreeId]
  )
  return <LanArtifactShareButton resolveTarget={resolveTarget} className={className} />
}
