import {
  ARTIFACT_SHARE_COMMENT_TOKEN_HEADER,
  ARTIFACT_SHARE_COMMENTS_SEGMENT,
  ArtifactShareComment,
  ArtifactShareCommentCreated,
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
): Promise<
  { comment: ArtifactShareComment; editToken: string } | { failure: ShareCommentPostError }
> {
  try {
    const response = await fetch(commentsUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(input)
    })
    if (response.status === 429) {
      return { failure: 'rate-limited' }
    }
    if (response.status === 409) {
      return { failure: 'too-many-comments' }
    }
    if (!response.ok) {
      return { failure: 'failed' }
    }
    const parsed = ArtifactShareCommentCreated.safeParse(await response.json())
    return parsed.success ? parsed.data : { failure: 'failed' }
  } catch {
    return { failure: 'failed' }
  }
}

function ownCommentRequest(
  method: 'PATCH' | 'DELETE',
  id: string,
  editToken: string,
  body?: string
): Promise<Response> {
  return fetch(`${commentsUrl()}?id=${encodeURIComponent(id)}`, {
    method,
    headers: {
      Accept: 'application/json',
      [ARTIFACT_SHARE_COMMENT_TOKEN_HEADER]: editToken,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    ...(body === undefined ? {} : { body: JSON.stringify({ body }) })
  })
}

export async function editShareComment(
  id: string,
  editToken: string,
  body: string
): Promise<ArtifactShareComment | null> {
  try {
    const response = await ownCommentRequest('PATCH', id, editToken, body)
    if (!response.ok) {
      return null
    }
    const json: unknown = await response.json()
    const parsed = ArtifactShareComment.safeParse(
      json !== null && typeof json === 'object' && 'comment' in json ? json.comment : null
    )
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** 'gone' when the file's owner already removed it, which the reader sees the same as deleted. */
export async function deleteShareComment(
  id: string,
  editToken: string
): Promise<'deleted' | 'gone' | 'failed'> {
  try {
    const response = await ownCommentRequest('DELETE', id, editToken)
    return response.ok ? 'deleted' : response.status === 404 ? 'gone' : 'failed'
  } catch {
    return 'failed'
  }
}
