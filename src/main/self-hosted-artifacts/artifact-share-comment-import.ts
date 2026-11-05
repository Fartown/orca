import { createHash } from 'node:crypto'
import { mkdirSync, watch, type FSWatcher } from 'node:fs'
import { join } from 'node:path'
import type { DiffComment } from '../../shared/diff-comment-types'
import { relativePathInsideRoot } from '../../shared/cross-platform-path'
import { parseExecutionHostId } from '../../shared/execution-host'
import type { ArtifactShareComment } from '../../shared/self-hosted-artifacts/artifact-share-comments-contract'
import {
  listArtifactShareCommentFiles,
  readArtifactShareCommentImportLedger,
  recordArtifactShareCommentImports,
  type StoredArtifactShareCommentFile
} from './store/artifact-share-comments'
import {
  artifactShareCommentImportLedgerPath,
  artifactShareCommentsDir
} from './store/artifact-share-store-layout'

const IMPORT_DEBOUNCE_MS = 300

type ImportWorktree = { id: string; path: string; hostId?: string; diffComments?: DiffComment[] }

/** The slice of the workspace runtime that owns review notes on this computer. */
export type ArtifactShareCommentImportRuntime = {
  resolveWorktreeForContainedPath(path: string): Promise<ImportWorktree | null>
  showManagedWorktree(selector: string, requiredHostId?: 'local'): Promise<ImportWorktree>
  updateManagedWorktreeMeta(
    selector: string,
    updates: { diffComments: DiffComment[]; diffCommentsBase: DiffComment[] }
  ): Promise<unknown>
}

export function artifactShareReviewNoteId(commentId: string): string {
  return `share-comment-${commentId}`
}

function toReviewNote(
  worktreeId: string,
  filePath: string,
  comment: ArtifactShareComment
): DiffComment {
  const createdAt = Date.parse(comment.createdAt)
  return {
    id: artifactShareReviewNoteId(comment.id),
    worktreeId,
    filePath,
    source: 'markdown',
    ...(comment.startLine === comment.endLine ? {} : { startLine: comment.startLine }),
    lineNumber: comment.endLine,
    ...(comment.quote ? { selectedText: comment.quote } : {}),
    // Why the name in the body: notes have no author field, and the agent should know who asked.
    body: `${comment.author} via share link: ${comment.body}`,
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    side: 'modified'
  }
}

/** Only workspaces this process runs on this computer; an SSH-routed row with the same path is not it. */
function isOnThisComputer(worktree: ImportWorktree): boolean {
  return !worktree.hostId || parseExecutionHostId(worktree.hostId)?.kind === 'local'
}

/**
 * Turns reader comments into review notes of the workspace that holds the file. Comments for files
 * no workspace here contains wait, so they arrive once that workspace is added.
 */
export async function importArtifactShareComments(input: {
  home: string
  ledgerPath: string
  runtime: ArtifactShareCommentImportRuntime
}): Promise<number> {
  const ledger = readArtifactShareCommentImportLedger(input.ledgerPath)
  const handled: string[] = []
  const failures: unknown[] = []
  let added = 0
  for (const file of listArtifactShareCommentFiles(input.home)) {
    try {
      const imported = await importCommentFile(input.runtime, file, ledger)
      handled.push(...imported.handled)
      added += imported.added
    } catch (error) {
      // Why: one workspace that cannot be written must not hold back notes for the others.
      failures.push(error)
    }
  }
  if (handled.length > 0) {
    await recordArtifactShareCommentImports(input.ledgerPath, handled)
  }
  if (failures.length > 0) {
    throw failures[0]
  }
  return added
}

async function importCommentFile(
  runtime: ArtifactShareCommentImportRuntime,
  file: StoredArtifactShareCommentFile,
  ledger: ReadonlySet<string>
): Promise<{ handled: string[]; added: number }> {
  const skipped = { handled: [], added: 0 }
  const pending = file.comments.filter((comment) => !ledger.has(comment.id))
  if (pending.length === 0) {
    return skipped
  }
  const absolutePath = join(file.rootPath, file.relativePath)
  const owner = await runtime.resolveWorktreeForContainedPath(absolutePath)
  if (!owner || !isOnThisComputer(owner)) {
    return skipped
  }
  const worktree = await runtime.showManagedWorktree(`id:${owner.id}`, 'local')
  const filePath = relativePathInsideRoot(worktree.path, absolutePath)
  if (!filePath) {
    return skipped
  }
  const base = worktree.diffComments ?? []
  const present = new Set(base.map((note) => note.id))
  const notes = pending
    .filter((comment) => !present.has(artifactShareReviewNoteId(comment.id)))
    .map((comment) => toReviewNote(worktree.id, filePath, comment))
  if (notes.length > 0) {
    // Why the base: the owner merges, so notes another client added meanwhile are kept.
    await runtime.updateManagedWorktreeMeta(`id:${worktree.id}`, {
      diffComments: [...base, ...notes],
      diffCommentsBase: base
    })
  }
  return { handled: pending.map((comment) => comment.id), added: notes.length }
}

/**
 * Watches this computer's comment folder; the share server and this importer meet on disk, so
 * whichever Orca serves the link, the Orca that owns the workspace adds the notes.
 */
export function startArtifactShareCommentImport(input: {
  home: string
  userDataPath: string
  runtime: ArtifactShareCommentImportRuntime
  onError: (error: unknown) => void
}): () => void {
  const profileKey = createHash('sha256').update(input.userDataPath).digest('hex').slice(0, 16)
  const ledgerPath = artifactShareCommentImportLedgerPath(input.home, profileKey)
  let queue: Promise<void> = Promise.resolve()
  let timer: NodeJS.Timeout | null = null
  let stopped = false
  const run = (): void => {
    queue = queue
      .then(async () => {
        if (!stopped) {
          await importArtifactShareComments({
            home: input.home,
            ledgerPath,
            runtime: input.runtime
          })
        }
      })
      .catch(input.onError)
  }
  let watcher: FSWatcher | null = null
  try {
    mkdirSync(artifactShareCommentsDir(input.home), { recursive: true, mode: 0o700 })
    watcher = watch(artifactShareCommentsDir(input.home), () => {
      if (timer) {
        clearTimeout(timer)
      }
      timer = setTimeout(run, IMPORT_DEBOUNCE_MS)
    })
    watcher.on('error', input.onError)
  } catch (error) {
    input.onError(error)
  }
  run()
  return () => {
    stopped = true
    if (timer) {
      clearTimeout(timer)
    }
    watcher?.close()
  }
}

/**
 * Deleting a comment also deletes the review note it became here, so a handled comment does not
 * linger in Orca. Notes in workspaces on other computers are theirs to keep.
 */
export async function removeArtifactShareReviewNotes(
  runtime: ArtifactShareCommentImportRuntime,
  absolutePath: string,
  commentIds: readonly string[]
): Promise<number> {
  const owner = await runtime.resolveWorktreeForContainedPath(absolutePath)
  if (!owner || !isOnThisComputer(owner) || commentIds.length === 0) {
    return 0
  }
  const worktree = await runtime.showManagedWorktree(`id:${owner.id}`, 'local')
  const noteIds = new Set(commentIds.map(artifactShareReviewNoteId))
  const base = worktree.diffComments ?? []
  const kept = base.filter((note) => !noteIds.has(note.id))
  if (kept.length !== base.length) {
    await runtime.updateManagedWorktreeMeta(`id:${worktree.id}`, {
      diffComments: kept,
      diffCommentsBase: base
    })
  }
  return base.length - kept.length
}
