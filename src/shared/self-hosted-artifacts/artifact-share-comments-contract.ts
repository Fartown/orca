import { z } from 'zod'

export const ARTIFACT_SHARE_COMMENT_LIMITS = {
  author: 64,
  body: 4_000,
  quote: 300,
  perFile: 500,
  requestBytes: 16 * 1024
} as const

/** Readers post to `/_share/comments/<token>/<path>`; the page shares the path after its own token. */
export const ARTIFACT_SHARE_COMMENTS_SEGMENT = 'comments'

const SourceLine = z.number().int().min(1).max(10_000_000)

export const ArtifactShareCommentInput = z
  .object({
    author: z.string().trim().min(1).max(ARTIFACT_SHARE_COMMENT_LIMITS.author),
    body: z.string().trim().min(1).max(ARTIFACT_SHARE_COMMENT_LIMITS.body),
    startLine: SourceLine,
    endLine: SourceLine,
    quote: z.string().trim().max(ARTIFACT_SHARE_COMMENT_LIMITS.quote).optional()
  })
  .refine((input) => input.endLine >= input.startLine, { message: 'endLine before startLine' })
export type ArtifactShareCommentInput = z.infer<typeof ArtifactShareCommentInput>

/** Lines are 1-based source lines of the shared file, the same anchors Orca's review notes use. */
export const ArtifactShareComment = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{16}$/),
  author: z.string().min(1).max(ARTIFACT_SHARE_COMMENT_LIMITS.author),
  body: z.string().min(1).max(ARTIFACT_SHARE_COMMENT_LIMITS.body),
  startLine: SourceLine,
  endLine: SourceLine,
  quote: z.string().max(ARTIFACT_SHARE_COMMENT_LIMITS.quote).optional(),
  createdAt: z.string()
})
export type ArtifactShareComment = z.infer<typeof ArtifactShareComment>

export const ArtifactShareCommentList = z.object({ comments: z.array(ArtifactShareComment) })
export type ArtifactShareCommentList = z.infer<typeof ArtifactShareCommentList>
