import {
  ARTIFACT_SHARE_COMMENTS_SEGMENT,
  ArtifactShareComment,
  ArtifactShareCommentList,
  type ArtifactShareCommentInput
} from '../../../../../shared/self-hosted-artifacts/artifact-share-comments-contract'

export type ShareCommentPostError = 'rate-limited' | 'too-many-comments' | 'failed'

/** The page lives at `/<token>/<path>`; its comments live at `/_share/comments/<token>/<path>`. */
function commentsUrl(): string {
  return `/_share/${ARTIFACT_SHARE_COMMENTS_SEGMENT}${window.location.pathname}`
}

/** Null when this server cannot take comments (an older Orca, or the file is no longer shared). */
export async function fetchShareComments(): Promise<ArtifactShareComment[] | null> {
  try {
    const response = await fetch(commentsUrl(), { headers: { Accept: 'application/json' } })
    if (!response.ok) {
      return null
    }
    const parsed = ArtifactShareCommentList.safeParse(await response.json())
    return parsed.success ? parsed.data.comments : null
  } catch {
    return null
  }
}

export async function postShareComment(
  input: ArtifactShareCommentInput
): Promise<{ comment: ArtifactShareComment } | { error: ShareCommentPostError }> {
  try {
    const response = await fetch(commentsUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(input)
    })
    if (response.status === 429) {
      return { error: 'rate-limited' }
    }
    if (response.status === 409) {
      return { error: 'too-many-comments' }
    }
    if (!response.ok) {
      return { error: 'failed' }
    }
    const body: unknown = await response.json()
    const parsed = ArtifactShareComment.safeParse(
      body !== null && typeof body === 'object' && 'comment' in body ? body.comment : null
    )
    return parsed.success ? { comment: parsed.data } : { error: 'failed' }
  } catch {
    return { error: 'failed' }
  }
}
