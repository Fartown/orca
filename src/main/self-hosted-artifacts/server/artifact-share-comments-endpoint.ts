import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname } from 'node:path'
import {
  ARTIFACT_SHARE_COMMENT_LIMITS,
  ArtifactShareCommentInput
} from '../../../shared/self-hosted-artifacts/artifact-share-comments-contract'
import { readArtifactShareWorkspaces } from '../store/artifact-share-records'
import {
  addArtifactShareComment,
  ArtifactShareCommentsFullError,
  readArtifactShareComments,
  type ArtifactShareCommentTarget
} from '../store/artifact-share-comments'
import { resolveArtifactShareRequestFile } from './artifact-share-request-path'

export const ARTIFACT_SHARE_MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown'])

const RATE_WINDOW_MS = 60_000
const RATE_MAX_PER_ADDRESS = 20
const RATE_MAX_ADDRESSES = 1_024

export type ArtifactShareCommentRateLimiter = (address: string, now: number) => boolean

/** Bounds how fast one address can write; memory stays bounded however many addresses call. */
export function createArtifactShareCommentRateLimiter(): ArtifactShareCommentRateLimiter {
  const recent = new Map<string, number[]>()
  return (address, now) => {
    const kept = (recent.get(address) ?? []).filter((at) => now - at < RATE_WINDOW_MS)
    if (kept.length >= RATE_MAX_PER_ADDRESS) {
      recent.set(address, kept)
      return false
    }
    recent.delete(address)
    const oldest = recent.keys().next()
    if (recent.size >= RATE_MAX_ADDRESSES && !oldest.done) {
      recent.delete(oldest.value)
    }
    recent.set(address, [...kept, now])
    return true
  }
}

type CommentsOutcome = { status: number }

function sendJson(
  request: IncomingMessage,
  response: ServerResponse,
  status: number,
  value: unknown
): CommentsOutcome {
  const body = JSON.stringify(value)
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Content-Security-Policy', "default-src 'none'")
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Content-Length', Buffer.byteLength(body))
  response.end(request.method === 'HEAD' ? undefined : body)
  return { status }
}

/** A same-page fetch carries this host as its origin; anything else is another site posting blind. */
function isSameOriginWrite(request: IncomingMessage): boolean {
  const site = request.headers['sec-fetch-site']
  if (site !== undefined && site !== 'same-origin') {
    return false
  }
  const origin = request.headers.origin
  return origin === undefined || origin === `http://${request.headers.host ?? ''}`
}

function readLimitedBody(request: IncomingMessage, limit: number): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > limit) {
        request.removeAllListeners('data')
        request.resume()
        resolve(null)
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

async function resolveCommentTarget(
  home: string,
  token: string,
  segments: readonly string[]
): Promise<ArtifactShareCommentTarget | null> {
  const workspace = readArtifactShareWorkspaces(home).find((candidate) => candidate.token === token)
  const file = workspace
    ? await resolveArtifactShareRequestFile(workspace.rootPath, segments)
    : null
  if (!workspace || !file) {
    return null
  }
  return ARTIFACT_SHARE_MARKDOWN_EXTENSIONS.has(extname(file.relativePath).toLowerCase())
    ? { rootPath: workspace.rootPath, relativePath: file.relativePath }
    : null
}

/** Reader comments on a shared Markdown file: the only request the share server accepts a body for. */
export async function handleArtifactShareCommentsRequest(input: {
  home: string
  request: IncomingMessage
  response: ServerResponse
  token: string
  segments: readonly string[]
  allowWrite: ArtifactShareCommentRateLimiter
  now: () => Date
}): Promise<CommentsOutcome> {
  const { request, response } = input
  if (request.method === 'GET' || request.method === 'HEAD') {
    const target = await resolveCommentTarget(input.home, input.token, input.segments)
    return target
      ? sendJson(request, response, 200, {
          comments: readArtifactShareComments(input.home, target)
        })
      : sendJson(request, response, 404, { error: 'not-found' })
  }
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'GET, HEAD, POST')
    return sendJson(request, response, 405, { error: 'method-not-allowed' })
  }
  if (!String(request.headers['content-type'] ?? '').startsWith('application/json')) {
    return sendJson(request, response, 415, { error: 'json-required' })
  }
  if (!isSameOriginWrite(request)) {
    return sendJson(request, response, 403, { error: 'cross-origin' })
  }
  const now = input.now()
  if (!input.allowWrite(request.socket.remoteAddress ?? 'unknown', now.getTime())) {
    return sendJson(request, response, 429, { error: 'rate-limited' })
  }
  const raw = await readLimitedBody(request, ARTIFACT_SHARE_COMMENT_LIMITS.requestBytes)
  if (raw === null) {
    return sendJson(request, response, 413, { error: 'too-large' })
  }
  let parsed: ReturnType<typeof ArtifactShareCommentInput.safeParse>
  try {
    parsed = ArtifactShareCommentInput.safeParse(JSON.parse(raw))
  } catch {
    return sendJson(request, response, 400, { error: 'invalid-json' })
  }
  if (!parsed.success) {
    return sendJson(request, response, 400, { error: 'invalid-comment' })
  }
  const target = await resolveCommentTarget(input.home, input.token, input.segments)
  if (!target) {
    return sendJson(request, response, 404, { error: 'not-found' })
  }
  try {
    const comment = await addArtifactShareComment(input.home, target, parsed.data, now)
    return sendJson(request, response, 201, { comment })
  } catch (error) {
    if (error instanceof ArtifactShareCommentsFullError) {
      return sendJson(request, response, 409, { error: 'too-many-comments' })
    }
    throw error
  }
}
