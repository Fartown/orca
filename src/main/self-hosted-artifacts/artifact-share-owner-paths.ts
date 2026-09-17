import { realpath, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, relative, sep } from 'node:path'
import { isDeniedArtifactSharePath } from '../../shared/self-hosted-artifacts/artifact-share-denied-paths'
import {
  ARTIFACT_SHARE_ERROR_CODES,
  ArtifactShareError
} from '../../shared/self-hosted-artifacts/artifact-share-errors'

export type ArtifactShareOwnerTarget = {
  rootPath: string
  label: string
  relativePath: string
}

function denied(message: string): ArtifactShareError {
  return new ArtifactShareError(ARTIFACT_SHARE_ERROR_CODES.pathDenied, message)
}

/** Relative path inside a canonical root with `/` separators, or null when it escapes the root. */
export function relativePathInsideRoot(rootPath: string, targetPath: string): string | null {
  const rel = relative(rootPath, targetPath)
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    return null
  }
  return sep === '/' ? rel : rel.split(sep).join('/')
}

/** Deepest already-shared root holding the file, so a share without a workspace reuses its token. */
function deepestSharedRootContaining(
  sharedRoots: readonly string[],
  filePath: string
): string | null {
  let best: string | null = null
  for (const root of sharedRoots) {
    if (relativePathInsideRoot(root, filePath) !== null && (!best || root.length > best.length)) {
      best = root
    }
  }
  return best
}

/**
 * Resolves what sharing a file would open, on the computer that owns it. Both paths are
 * canonicalized first so a symlinked file cannot extend a share beyond its workspace.
 */
export async function resolveArtifactShareOwnerTarget(input: {
  workspaceRoot?: string
  sourcePath: string
  sharedRoots?: readonly string[]
}): Promise<ArtifactShareOwnerTarget> {
  let rootPath: string
  let filePath: string
  let rootIsDirectory: boolean
  let fileIsFile: boolean
  try {
    filePath = await realpath(input.sourcePath)
    // Why the folder last: guessing a wider root (a Git repo at ~) could open far more than asked.
    rootPath = await realpath(
      input.workspaceRoot ??
        deepestSharedRootContaining(input.sharedRoots ?? [], filePath) ??
        dirname(filePath)
    )
    const [rootStat, fileStat] = await Promise.all([stat(rootPath), stat(filePath)])
    rootIsDirectory = rootStat.isDirectory()
    fileIsFile = fileStat.isFile()
  } catch {
    throw denied('The file or its workspace no longer exists on this computer.')
  }
  if (!rootIsDirectory) {
    throw denied('The workspace is not a directory.')
  }
  if (!fileIsFile) {
    throw denied('Only files can be shared.')
  }
  const relativePath = relativePathInsideRoot(rootPath, filePath)
  if (relativePath === null) {
    throw denied('The file is outside its workspace.')
  }
  if (isDeniedArtifactSharePath(relativePath)) {
    throw denied('This file looks like it holds credentials, so it cannot be shared.')
  }
  return { rootPath, label: basename(rootPath) || rootPath, relativePath }
}
