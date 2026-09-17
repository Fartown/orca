import { realpath, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { ARTIFACT_SHARE_TOKEN_PATTERN } from '../../../shared/self-hosted-artifacts/artifact-share-contract'
import { isDeniedArtifactSharePath } from '../../../shared/self-hosted-artifacts/artifact-share-denied-paths'
import { isUnsafeArtifactSharePathSegment } from '../../../shared/self-hosted-artifacts/artifact-share-url'
import { relativePathInsideRoot } from '../artifact-share-owner-paths'

export type ArtifactShareRequestTarget =
  | { kind: 'identity' }
  | { kind: 'asset'; name: string }
  | { kind: 'file'; token: string; segments: string[]; raw: boolean }
  | { kind: 'bad-request' }
  | { kind: 'not-found' }

const ASSET_NAME_PATTERN = /^[A-Za-z0-9._-]+$/

export function parseArtifactShareRequest(rawUrl: string | undefined): ArtifactShareRequestTarget {
  let url: URL
  try {
    url = new URL(rawUrl ?? '/', 'http://artifact-share.invalid')
  } catch {
    return { kind: 'bad-request' }
  }
  const encodedSegments = url.pathname.split('/').slice(1)
  let segments: string[]
  try {
    segments = encodedSegments.map((segment) => decodeURIComponent(segment))
  } catch {
    return { kind: 'bad-request' }
  }
  if (segments[0] === '_share') {
    if (segments.length === 2 && segments[1] === 'identity') {
      return { kind: 'identity' }
    }
    if (segments.length === 3 && segments[1] === 'assets' && ASSET_NAME_PATTERN.test(segments[2])) {
      return { kind: 'asset', name: segments[2] }
    }
    return { kind: 'not-found' }
  }
  const [token, ...rest] = segments
  if (!token || !ARTIFACT_SHARE_TOKEN_PATTERN.test(token)) {
    return { kind: 'not-found' }
  }
  // Why: a trailing slash names the directory itself; any other empty segment is an escape attempt.
  const pathSegments = rest.length > 0 && rest.at(-1) === '' ? rest.slice(0, -1) : rest
  if (pathSegments.some(isUnsafeArtifactSharePathSegment)) {
    return { kind: 'not-found' }
  }
  return { kind: 'file', token, segments: pathSegments, raw: url.searchParams.get('raw') === '1' }
}

export type ResolvedArtifactShareFile = { absolutePath: string; relativePath: string; size: number }

/**
 * Maps request segments to a readable file inside the shared root, or null. Every refusal
 * looks the same to the reader so the endpoint cannot be used to probe what exists.
 */
export async function resolveArtifactShareRequestFile(
  rootPath: string,
  segments: readonly string[]
): Promise<ResolvedArtifactShareFile | null> {
  if (isDeniedArtifactSharePath(segments.join('/'))) {
    return null
  }
  try {
    const canonicalRoot = await realpath(rootPath)
    let candidate = await realpath(join(canonicalRoot, ...segments))
    let candidateStat = await stat(candidate)
    if (candidateStat.isDirectory()) {
      candidate = await realpath(join(candidate, 'index.html'))
      candidateStat = await stat(candidate)
    }
    const relativePath = relativePathInsideRoot(canonicalRoot, candidate)
    if (
      !candidateStat.isFile() ||
      relativePath === null ||
      isDeniedArtifactSharePath(relativePath)
    ) {
      return null
    }
    return { absolutePath: candidate, relativePath, size: candidateStat.size }
  } catch {
    return null
  }
}
