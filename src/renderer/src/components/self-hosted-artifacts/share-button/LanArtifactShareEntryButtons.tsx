import type { DocPreviewGrantLocation } from '@/lib/doc-preview-grants'
import { useCallback } from 'react'
import { useAppStore } from '@/store'
import { findWorktreeById } from '@/store/slices/worktree-helpers'
import type { OpenFile } from '@/store/slices/editor'
import type { DocPreviewDocumentIdentity } from '@/components/browser-pane/workspace-doc/doc-preview-document-identity'
import type { BrowserChromeShareControl } from '@/components/browser-pane/assemble-chrome/browser-chrome-toolbar'
import {
  resolveEditorFileShareTarget,
  resolveDocPreviewShareTarget
} from './lan-artifact-share-target'
import { LanArtifactShareButton, type LanArtifactShareControl } from './LanArtifactShareButton'

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
  className,
  ...control
}: {
  worktreeId: string
  filePath: string
  className?: string
} & LanArtifactShareControl): React.JSX.Element {
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
  return <LanArtifactShareButton resolveTarget={resolveTarget} className={className} {...control} />
}

/** A document preview shares from the owner of the grant currently displayed. */
export function DocPreviewLanShareButton({
  identity,
  location,
  className,
  ...control
}: {
  identity: DocPreviewDocumentIdentity
  location: DocPreviewGrantLocation
  className?: string
} & LanArtifactShareControl): React.JSX.Element {
  const resolveTarget = useCallback(
    () => resolveDocPreviewShareTarget(location, identity.absolutePath),
    [identity.absolutePath, location]
  )
  return <LanArtifactShareButton resolveTarget={resolveTarget} className={className} {...control} />
}

// Why built here: a render function declared inside the toolbar component reads as a nested
// component; the chrome only calls it with its controlled open state and overflow anchor.
export function browserFileLanShareControl(
  worktreeId: string,
  filePath: string
): (control: BrowserChromeShareControl) => React.JSX.Element {
  return (control) => (
    <BrowserFileLanShareButton
      worktreeId={worktreeId}
      filePath={filePath}
      className="h-7 w-7"
      {...control}
    />
  )
}

export function docPreviewLanShareControl(
  identity: DocPreviewDocumentIdentity,
  location: DocPreviewGrantLocation | null
): ((control: BrowserChromeShareControl) => React.JSX.Element) | undefined {
  if (!location) {return undefined}
  return (control) => (
    <DocPreviewLanShareButton
      identity={identity}
      location={location}
      className="h-7 w-7"
      {...control}
    />
  )
}
