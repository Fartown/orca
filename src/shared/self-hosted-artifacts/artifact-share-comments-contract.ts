import { z } from 'zod'
import { ArtifactShareFileRequest, ArtifactShareHostLabel } from './artifact-share-contract'

export const ARTIFACT_SHARE_COMMENT_LIMITS = {
  author: 64,
  body: 4_000,
  /** The exact text a reader selected; Orca highlights it in the page and in the review note. */
  quote: 2_000,
  perFile: 500,
  requestBytes: 32 * 1024
} as const

/** Readers post to `/_share/comments/<token>/<path>`; the page shares the path after its own token. */
export const ARTIFACT_SHARE_COMMENTS_SEGMENT = 'comments'

const SourceLine = z.number().int().min(1).max(10_000_000)

/**
 * Where on the page a comment sits: the rendered block starting at `line`, `offset` characters
 * into its whitespace-collapsed text, for `length` characters (blocks it spans joined by one
 * character each). `whole` marks a comment on a whole block rather than on selected text.
 */
export const ArtifactShareCommentAnchor = z.object({
  line: SourceLine,
  offset: z.number().int().min(0).max(10_000_000),
  length: z.number().int().min(0).max(10_000_000),
  whole: z.boolean().optional()
})
export type ArtifactShareCommentAnchor = z.infer<typeof ArtifactShareCommentAnchor>

export const ArtifactShareCommentInput = z
  .object({
    /** Earlier pages sent a reader's name; the page no longer asks, since a link carries no identity. */
    author: z.string().trim().max(ARTIFACT_SHARE_COMMENT_LIMITS.author).optional(),
    body: z.string().trim().min(1).max(ARTIFACT_SHARE_COMMENT_LIMITS.body),
    startLine: SourceLine,
    endLine: SourceLine,
    quote: z.string().trim().max(ARTIFACT_SHARE_COMMENT_LIMITS.quote).optional(),
    anchor: ArtifactShareCommentAnchor.optional()
  })
  .refine((input) => input.endLine >= input.startLine, { message: 'endLine before startLine' })
export type ArtifactShareCommentInput = z.infer<typeof ArtifactShareCommentInput>

const CommentId = z.string().regex(/^[A-Za-z0-9_-]{16}$/)

/** Lines are 1-based source lines of the shared file, the same anchors Orca's review notes use. */
export const ArtifactShareComment = z.object({
  id: CommentId,
  author: z.string().min(1).max(ARTIFACT_SHARE_COMMENT_LIMITS.author).optional(),
  body: z.string().min(1).max(ARTIFACT_SHARE_COMMENT_LIMITS.body),
  startLine: SourceLine,
  endLine: SourceLine,
  quote: z.string().max(ARTIFACT_SHARE_COMMENT_LIMITS.quote).optional(),
  anchor: ArtifactShareCommentAnchor.optional(),
  createdAt: z.string(),
  /** Set when the author edits the text; Orca refreshes the review note it became. */
  updatedAt: z.string().optional()
})
export type ArtifactShareComment = z.infer<typeof ArtifactShareComment>

export const ArtifactShareCommentList = z.object({ comments: z.array(ArtifactShareComment) })
export type ArtifactShareCommentList = z.infer<typeof ArtifactShareCommentList>

/** Comments on one file, read on the computer that holds it, oldest first. */
export const ArtifactShareCommentsResult = z.object({
  host: ArtifactShareHostLabel,
  comments: z.array(ArtifactShareComment)
})
export type ArtifactShareCommentsResult = z.infer<typeof ArtifactShareCommentsResult>

/** Either the listed comments or, with `all`, every comment on the file. */
export const ArtifactShareDeleteCommentsRequest = ArtifactShareFileRequest.extend({
  commentIds: z.array(CommentId).min(1).max(ARTIFACT_SHARE_COMMENT_LIMITS.perFile).optional(),
  all: z.literal(true).optional()
})
export type ArtifactShareDeleteCommentsRequest = z.infer<typeof ArtifactShareDeleteCommentsRequest>

export const ArtifactShareOwnerDeleteCommentsRequest = ArtifactShareDeleteCommentsRequest.omit({
  executionHostId: true
})
export type ArtifactShareOwnerDeleteCommentsRequest = z.infer<
  typeof ArtifactShareOwnerDeleteCommentsRequest
>

/** `removedNotes` counts the review notes those comments had become on that computer. */
export const ArtifactShareDeleteCommentsResult = z.object({
  host: ArtifactShareHostLabel,
  deletedComments: z.number().int().min(0),
  removedNotes: z.number().int().min(0)
})
export type ArtifactShareDeleteCommentsResult = z.infer<typeof ArtifactShareDeleteCommentsResult>

export const ArtifactShareCommentEdit = z.object({
  body: z.string().trim().min(1).max(ARTIFACT_SHARE_COMMENT_LIMITS.body)
})

/** What a reader's add or edit returns: the comment as it is now stored. */
export const ArtifactShareCommentSaved = z.object({ comment: ArtifactShareComment })
