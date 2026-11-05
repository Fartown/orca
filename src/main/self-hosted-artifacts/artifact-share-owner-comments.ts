import { realpath } from 'node:fs/promises'
import type {
  ArtifactShareComment,
  ArtifactShareOwnerDeleteCommentsRequest
} from '../../shared/self-hosted-artifacts/artifact-share-comments-contract'
import {
  ARTIFACT_SHARE_ERROR_CODES,
  ArtifactShareError
} from '../../shared/self-hosted-artifacts/artifact-share-errors'
import {
  deleteArtifactShareComments,
  findArtifactShareCommentFiles
} from './store/artifact-share-comments'

export type ArtifactShareReviewNoteRemover = (
  absolutePath: string,
  commentIds: readonly string[]
) => Promise<number>

/** Comments are keyed by the canonical path the share server resolved, so look them up the same way. */
async function canonicalSourcePath(sourcePath: string): Promise<string> {
  try {
    return await realpath(sourcePath)
  } catch {
    throw new ArtifactShareError(
      ARTIFACT_SHARE_ERROR_CODES.pathDenied,
      'The file no longer exists on this computer.'
    )
  }
}

export async function listArtifactShareFileComments(
  home: string,
  sourcePath: string
): Promise<ArtifactShareComment[]> {
  const absolutePath = await canonicalSourcePath(sourcePath)
  return findArtifactShareCommentFiles(home, absolutePath)
    .flatMap((file) => file.comments)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

export async function deleteArtifactShareFileComments(
  home: string,
  request: ArtifactShareOwnerDeleteCommentsRequest,
  removeReviewNotes: ArtifactShareReviewNoteRemover | undefined
): Promise<{ deletedComments: number; removedNotes: number }> {
  if (Boolean(request.all) === Boolean(request.commentIds)) {
    throw new Error('Pass either comment ids or all, not both or neither.')
  }
  const absolutePath = await canonicalSourcePath(request.sourcePath)
  const ids = request.all ? 'all' : new Set(request.commentIds)
  const removed: string[] = []
  for (const file of findArtifactShareCommentFiles(home, absolutePath)) {
    const deleted = await deleteArtifactShareComments(home, file, ids)
    removed.push(...deleted.map((comment) => comment.id))
  }
  const removedNotes = removeReviewNotes ? await removeReviewNotes(absolutePath, removed) : 0
  return { deletedComments: removed.length, removedNotes }
}
