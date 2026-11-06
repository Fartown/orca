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
  type ArtifactShareCommentImportRecord,
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
    body: comment.author
      ? `${comment.author} via share link: ${comment.body}`
      : `Via share link: ${comment.body}`,
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    side: 'modified'
  }
}

/** Only workspaces this process runs on this computer; an SSH-routed row with the same path is not it. */
function isOnThisComputer(worktree: ImportWorktree): boolean {
  return !worktree.hostId || parseExecutionHostId(worktree.hostId)?.kind === 'local'
}

const DELETED_VERSION = 'deleted'

type Ledger = ReadonlyMap<string, ArtifactShareCommentImportRecord>

function commentVersion(comment: ArtifactShareComment): string {
  return comment.updatedAt ?? comment.createdAt
}

/** A note follows its comment only while it still holds exactly what the import wrote. */
function isUntouched(
  note: DiffComment | undefined,
  record: ArtifactShareCommentImportRecord
): boolean {
  return note !== undefined && record.noteBody !== null && note.body === record.noteBody
}

/**
 * Keeps review notes in step with reader comments: new comments become notes, an author's edit
 * or delete follows to a note nobody changed in Orca. Comments for files no workspace here
 * contains wait, so they arrive once that workspace is added.
 */
export async function importArtifactShareComments(input: {
  home: string
  ledgerPath: string
  runtime: ArtifactShareCommentImportRuntime
}): Promise<number> {
  const ledger = readArtifactShareCommentImportLedger(input.ledgerPath)
  const records = new Map<string, ArtifactShareCommentImportRecord>()
  const failures: unknown[] = []
  let changed = 0
  for (const file of listArtifactShareCommentFiles(input.home)) {
    try {
      changed += await syncCommentFile(input.runtime, file, ledger, records)
    } catch (error) {
      // Why: one workspace that cannot be written must not hold back notes for the others.
      failures.push(error)
    }
  }
  if (records.size > 0) {
    await recordArtifactShareCommentImports(input.ledgerPath, records)
  }
  if (failures.length > 0) {
    throw failures[0]
  }
  return changed
}

async function syncCommentFile(
  runtime: ArtifactShareCommentImportRuntime,
  file: StoredArtifactShareCommentFile,
  ledger: Ledger,
  records: Map<string, ArtifactShareCommentImportRecord>
): Promise<number> {
  const added = file.comments.filter((comment) => !ledger.has(comment.id))
  const edited = file.comments.filter((comment) => {
    const record = ledger.get(comment.id)
    return (
      record !== undefined && record.noteBody !== null && record.version !== commentVersion(comment)
    )
  })
  const deleted = file.deletedIds.filter((id) => {
    const record = ledger.get(id)
    return record !== undefined && record.version !== DELETED_VERSION
  })
  if (added.length + edited.length + deleted.length === 0) {
    return 0
  }
  const absolutePath = join(file.rootPath, file.relativePath)
  const owner = await runtime.resolveWorktreeForContainedPath(absolutePath)
  if (!owner || !isOnThisComputer(owner)) {
    return 0
  }
  const worktree = await runtime.showManagedWorktree(`id:${owner.id}`, 'local')
  const filePath = relativePathInsideRoot(worktree.path, absolutePath)
  if (!filePath) {
    return 0
  }
  const base = worktree.diffComments ?? []
  const notesById = new Map(base.map((note) => [note.id, note]))
  let next = [...base]
  let changes = 0
  for (const comment of added) {
    const note = toReviewNote(worktree.id, filePath, comment)
    if (!notesById.has(note.id)) {
      next.push(note)
      changes += 1
    }
    records.set(comment.id, { version: commentVersion(comment), noteBody: note.body })
  }
  for (const comment of edited) {
    const record = ledger.get(comment.id)
    const noteId = artifactShareReviewNoteId(comment.id)
    const current = notesById.get(noteId)
    if (record && isUntouched(current, record)) {
      const body = toReviewNote(worktree.id, filePath, comment).body
      next = next.map((note) => (note.id === noteId ? { ...note, body, sentAt: undefined } : note))
      records.set(comment.id, { version: commentVersion(comment), noteBody: body })
      changes += 1
    } else {
      records.set(comment.id, { version: commentVersion(comment), noteBody: null })
    }
  }
  for (const id of deleted) {
    const record = ledger.get(id)
    const noteId = artifactShareReviewNoteId(id)
    if (record && isUntouched(notesById.get(noteId), record)) {
      next = next.filter((note) => note.id !== noteId)
      changes += 1
    }
    records.set(id, { version: DELETED_VERSION, noteBody: null })
  }
  if (changes > 0) {
    // Why the base: the owner merges, so notes another client added meanwhile are kept.
    await runtime.updateManagedWorktreeMeta(`id:${worktree.id}`, {
      diffComments: next,
      diffCommentsBase: base
    })
  }
  return changes
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
