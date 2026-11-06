import {
  ARTIFACT_SHARE_COMMENTS_SEGMENT,
  ArtifactShareCommentList,
  ArtifactShareCommentSaved,
  type ArtifactShareComment,
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
): Promise<{ comment: ArtifactShareComment } | { failure: ShareCommentPostError }> {
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
    const parsed = ArtifactShareCommentSaved.safeParse(await response.json())
    return parsed.success ? parsed.data : { failure: 'failed' }
  } catch {
    return { failure: 'failed' }
  }
}

function commentRequest(method: 'PATCH' | 'DELETE', id: string, body?: string): Promise<Response> {
  return fetch(`${commentsUrl()}?id=${encodeURIComponent(id)}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    ...(body === undefined ? {} : { body: JSON.stringify({ body }) })
  })
}

export async function editShareComment(
  id: string,
  body: string
): Promise<ArtifactShareComment | null> {
  try {
    const response = await commentRequest('PATCH', id, body)
    if (!response.ok) {
      return null
    }
    const parsed = ArtifactShareCommentSaved.safeParse(await response.json())
    return parsed.success ? parsed.data.comment : null
  } catch {
    return null
  }
}

/** 'gone' when someone else already removed it, which the reader sees the same as deleted. */
export async function deleteShareComment(id: string): Promise<'deleted' | 'gone' | 'failed'> {
  try {
    const response = await commentRequest('DELETE', id)
    return response.ok ? 'deleted' : response.status === 404 ? 'gone' : 'failed'
  } catch {
    return 'failed'
  }
}
