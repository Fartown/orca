import { createHash, randomBytes } from 'node:crypto'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { writeDurableSecureJsonFile } from '../../../shared/secure-file'
import {
  ARTIFACT_SHARE_COMMENT_LIMITS,
  ArtifactShareComment,
  type ArtifactShareCommentInput
} from '../../../shared/self-hosted-artifacts/artifact-share-comments-contract'
import { withFileTransactionLock } from '../../file-transaction-lock'
import {
  ARTIFACT_SHARE_FILE_VERSION,
  readVersionedArtifactShareFile
} from './artifact-share-json-file'
import { artifactShareCommentsDir } from './artifact-share-store-layout'

const StoredCommentFile = z.object({
  version: z.number().int(),
  rootPath: z.string().min(1),
  relativePath: z.string().min(1),
  // Why the plain schema: unknown fields from earlier versions (an author token hash) are dropped.
  comments: z.array(ArtifactShareComment),
  /** Removed comment ids, so the Orca that imported them also removes their review notes. */
  deletedIds: z.array(z.string()).optional()
})
type StoredCommentFileShape = z.infer<typeof StoredCommentFile>

export type StoredArtifactShareCommentFile = {
  rootPath: string
  relativePath: string
  comments: ArtifactShareComment[]
  deletedIds: string[]
}

export type ArtifactShareCommentTarget = { rootPath: string; relativePath: string }

export class ArtifactShareCommentsFullError extends Error {}

/** Keyed by workspace folder, not token, so comments outlive stopping and re-sharing a workspace. */
function commentFilePath(home: string, target: ArtifactShareCommentTarget): string {
  const key = createHash('sha256')
    .update(`${target.rootPath}\0${target.relativePath}`)
    .digest('hex')
    .slice(0, 32)
  return join(artifactShareCommentsDir(home), `${key}.json`)
}

function toFile(stored: StoredCommentFileShape): StoredArtifactShareCommentFile {
  return {
    rootPath: stored.rootPath,
    relativePath: stored.relativePath,
    comments: stored.comments,
    deletedIds: stored.deletedIds ?? []
  }
}

/** Every write goes through one cross-process lock, like the share records. */
function mutateCommentFile<T>(
  home: string,
  target: ArtifactShareCommentTarget,
  apply: (file: StoredCommentFileShape) => T
): Promise<T> {
  const path = commentFilePath(home, target)
  return withFileTransactionLock(path, async () => {
    const file = readVersionedArtifactShareFile(path, StoredCommentFile) ?? {
      version: ARTIFACT_SHARE_FILE_VERSION,
      rootPath: target.rootPath,
      relativePath: target.relativePath,
      comments: []
    }
    const result = apply(file)
    writeDurableSecureJsonFile(path, {
      ...file,
      version: ARTIFACT_SHARE_FILE_VERSION,
      // Why bounded: tombstones only need to outlive the next import, not grow forever.
      deletedIds: (file.deletedIds ?? []).slice(-ARTIFACT_SHARE_COMMENT_LIMITS.perFile)
    })
    return result
  })
}

export function readArtifactShareComments(
  home: string,
  target: ArtifactShareCommentTarget
): ArtifactShareComment[] {
  const stored = readVersionedArtifactShareFile(commentFilePath(home, target), StoredCommentFile)
  return stored ? stored.comments : []
}

export function addArtifactShareComment(
  home: string,
  target: ArtifactShareCommentTarget,
  input: ArtifactShareCommentInput,
  now: Date
): Promise<ArtifactShareComment> {
  return mutateCommentFile(home, target, (file) => {
    if (file.comments.length >= ARTIFACT_SHARE_COMMENT_LIMITS.perFile) {
      throw new ArtifactShareCommentsFullError(`${target.relativePath} has too many comments`)
    }
    const comment: ArtifactShareComment = {
      id: randomBytes(12).toString('base64url'),
      ...(input.author ? { author: input.author } : {}),
      body: input.body,
      startLine: input.startLine,
      endLine: input.endLine,
      ...(input.quote ? { quote: input.quote } : {}),
      ...(input.anchor ? { anchor: input.anchor } : {}),
      createdAt: now.toISOString()
    }
    file.comments.push(comment)
    return comment
  })
}

/** Any reader with the link may change any comment; a share link carries no identity. */
export function editArtifactShareComment(
  home: string,
  target: ArtifactShareCommentTarget,
  change: { id: string; body: string; now: Date }
): Promise<ArtifactShareComment | null> {
  return mutateCommentFile(home, target, (file) => {
    const index = file.comments.findIndex((comment) => comment.id === change.id)
    const stored = file.comments[index]
    if (!stored) {
      return null
    }
    const updated = { ...stored, body: change.body, updatedAt: change.now.toISOString() }
    file.comments[index] = updated
    return updated
  })
}

/** Removes the listed comments, or all of them: a reader on the page, or the CLI on this computer. */
export function deleteArtifactShareComments(
  home: string,
  target: ArtifactShareCommentTarget,
  ids: ReadonlySet<string> | 'all'
): Promise<ArtifactShareComment[]> {
  return mutateCommentFile(home, target, (file) => {
    const removed = file.comments.filter((comment) => ids === 'all' || ids.has(comment.id))
    file.comments = file.comments.filter((comment) => !removed.includes(comment))
    file.deletedIds = [...(file.deletedIds ?? []), ...removed.map((comment) => comment.id)]
    return removed
  })
}

/** Every commented file on this computer; unreadable or newer-format files are skipped, not fatal. */
export function listArtifactShareCommentFiles(home: string): StoredArtifactShareCommentFile[] {
  let names: string[]
  try {
    names = readdirSync(artifactShareCommentsDir(home))
  } catch {
    return []
  }
  const files: StoredArtifactShareCommentFile[] = []
  for (const name of names) {
    if (!name.endsWith('.json')) {
      continue
    }
    try {
      const stored = readVersionedArtifactShareFile(
        join(artifactShareCommentsDir(home), name),
        StoredCommentFile
      )
      if (stored) {
        files.push(toFile(stored))
      }
    } catch {
      continue
    }
  }
  return files
}

/** Comment files for one file; a folder shared at different depths over time can hold several. */
export function findArtifactShareCommentFiles(
  home: string,
  absolutePath: string
): StoredArtifactShareCommentFile[] {
  return listArtifactShareCommentFiles(home).filter(
    (file) => join(file.rootPath, file.relativePath) === absolutePath
  )
}

/** What one Orca profile last wrote for each imported comment: its version and the note text. */
export type ArtifactShareCommentImportRecord = { version: string; noteBody: string | null }

const StoredImportLedger = z.object({
  version: z.number().int(),
  /** Ledgers before edit sync listed ids only; those notes are never rewritten. */
  importedCommentIds: z.array(z.string()).optional(),
  imported: z
    .record(z.string(), z.object({ version: z.string(), noteBody: z.string().nullable() }))
    .optional()
})

export function readArtifactShareCommentImportLedger(
  path: string
): Map<string, ArtifactShareCommentImportRecord> {
  const stored = readVersionedArtifactShareFile(path, StoredImportLedger)
  const ledger = new Map<string, ArtifactShareCommentImportRecord>()
  for (const id of stored?.importedCommentIds ?? []) {
    ledger.set(id, { version: '', noteBody: null })
  }
  for (const [id, record] of Object.entries(stored?.imported ?? {})) {
    ledger.set(id, record)
  }
  return ledger
}

export function recordArtifactShareCommentImports(
  path: string,
  records: ReadonlyMap<string, ArtifactShareCommentImportRecord>
): Promise<void> {
  return withFileTransactionLock(path, async () => {
    const ledger = readArtifactShareCommentImportLedger(path)
    for (const [id, record] of records) {
      ledger.set(id, record)
    }
    writeDurableSecureJsonFile(path, {
      version: ARTIFACT_SHARE_FILE_VERSION,
      imported: Object.fromEntries(ledger)
    })
  })
}
