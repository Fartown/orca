import { createHash, randomBytes } from 'node:crypto'
import { readdirSync, rmSync } from 'node:fs'
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
  comments: z.array(ArtifactShareComment)
})
export type StoredArtifactShareCommentFile = z.infer<typeof StoredCommentFile>

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
  const path = commentFilePath(home, target)
  return withFileTransactionLock(path, async () => {
    const comments = readVersionedArtifactShareFile(path, StoredCommentFile)?.comments ?? []
    if (comments.length >= ARTIFACT_SHARE_COMMENT_LIMITS.perFile) {
      throw new ArtifactShareCommentsFullError(`${target.relativePath} has too many comments`)
    }
    const comment: ArtifactShareComment = {
      id: randomBytes(12).toString('base64url'),
      author: input.author,
      body: input.body,
      startLine: input.startLine,
      endLine: input.endLine,
      ...(input.quote ? { quote: input.quote } : {}),
      createdAt: now.toISOString()
    }
    writeDurableSecureJsonFile(path, {
      version: ARTIFACT_SHARE_FILE_VERSION,
      rootPath: target.rootPath,
      relativePath: target.relativePath,
      comments: [...comments, comment]
    })
    return comment
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
        files.push(stored)
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

/** Removes the named comments, or every comment when `ids` is 'all'; returns what was removed. */
export function deleteArtifactShareComments(
  home: string,
  target: ArtifactShareCommentTarget,
  ids: ReadonlySet<string> | 'all'
): Promise<ArtifactShareComment[]> {
  const path = commentFilePath(home, target)
  return withFileTransactionLock(path, async () => {
    const comments = readVersionedArtifactShareFile(path, StoredCommentFile)?.comments ?? []
    const removed = comments.filter((comment) => ids === 'all' || ids.has(comment.id))
    const kept = comments.filter((comment) => !removed.includes(comment))
    if (removed.length === 0) {
      return []
    }
    if (kept.length === 0) {
      rmSync(path, { force: true })
    } else {
      writeDurableSecureJsonFile(path, {
        version: ARTIFACT_SHARE_FILE_VERSION,
        rootPath: target.rootPath,
        relativePath: target.relativePath,
        comments: kept
      })
    }
    return removed
  })
}

const StoredImportLedger = z.object({
  version: z.number().int(),
  importedCommentIds: z.array(z.string())
})

export function readArtifactShareCommentImportLedger(path: string): Set<string> {
  return new Set(readVersionedArtifactShareFile(path, StoredImportLedger)?.importedCommentIds ?? [])
}

export function recordArtifactShareCommentImports(
  path: string,
  commentIds: readonly string[]
): Promise<void> {
  return withFileTransactionLock(path, async () => {
    const imported = readArtifactShareCommentImportLedger(path)
    for (const id of commentIds) {
      imported.add(id)
    }
    writeDurableSecureJsonFile(path, {
      version: ARTIFACT_SHARE_FILE_VERSION,
      importedCommentIds: [...imported]
    })
  })
}
