import { extname } from 'node:path'
import { hasUnsafeProviderSessionIdChars } from '../../shared/agent-session-resume'
import {
  AI_VAULT_SESSION_TITLE_REQUEST_MAX_COUNT,
  type AiVaultSessionTitleRequest,
  type AiVaultSessionTitlesResult
} from '../../shared/ai-vault-session-title'
import { listAiVaultSessions } from './cached-session-list'
import { resolveAiVaultSessionTitlesInBackground } from './session-scanner-background'

const TRANSCRIPT_PATH_MAX_LENGTH = 32_768

function identityKey(entry: { agent: string; sessionId: string }): string {
  return `${entry.agent}\0${entry.sessionId}`
}

function normalizeRequest(request: AiVaultSessionTitleRequest): AiVaultSessionTitleRequest | null {
  const sessionId = request.sessionId.trim()
  if (!sessionId || sessionId.length > 512 || hasUnsafeProviderSessionIdChars(sessionId)) {
    return null
  }
  const transcriptPath = request.transcriptPath?.trim()
  if (
    !transcriptPath ||
    transcriptPath.length > TRANSCRIPT_PATH_MAX_LENGTH ||
    hasUnsafeProviderSessionIdChars(transcriptPath) ||
    extname(transcriptPath).toLowerCase() !== '.jsonl'
  ) {
    return { agent: request.agent, sessionId }
  }
  return { agent: request.agent, sessionId, transcriptPath }
}

export async function resolveLocalAiVaultSessionTitles(
  requests: AiVaultSessionTitleRequest[],
  signal?: AbortSignal
): Promise<AiVaultSessionTitlesResult> {
  const deduped = new Map<string, AiVaultSessionTitleRequest>()
  for (const request of requests.slice(0, AI_VAULT_SESSION_TITLE_REQUEST_MAX_COUNT)) {
    const normalized = normalizeRequest(request)
    if (!normalized) {
      continue
    }
    const key = identityKey(normalized)
    const previous = deduped.get(key)
    if (!previous?.transcriptPath || normalized.transcriptPath) {
      deduped.set(key, normalized)
    }
  }
  const wanted = [...deduped.values()]
  const resolved = await resolveAiVaultSessionTitlesInBackground(wanted, signal)
  return recoverMissingTitlesFromScan(wanted, resolved, signal)
}

/**
 * The read above needs a live transcript path, and Orca's stored one often is
 * not: most Codex identities never carry a path at all, and Claude rotates its
 * session file on resume/compact, which strands the path recorded earlier. Fall
 * back to the scan the history panel already caches — same transcripts, found
 * by walking the vault instead of by a remembered path, so both sides name a
 * session identically.
 */
async function recoverMissingTitlesFromScan(
  wanted: AiVaultSessionTitleRequest[],
  resolved: AiVaultSessionTitlesResult,
  signal?: AbortSignal
): Promise<AiVaultSessionTitlesResult> {
  const found = new Set(resolved.titles.map(identityKey))
  const missing = wanted.filter((request) => !found.has(identityKey(request)))
  if (missing.length === 0 || signal?.aborted) {
    return resolved
  }
  let titleByIdentity: Map<string, string>
  try {
    // Default depth, so a panel scan already in cache covers this without rescanning.
    const { sessions } = await listAiVaultSessions(undefined, { signal })
    titleByIdentity = new Map(
      sessions.map((session) => [identityKey(session), session.title.trim()])
    )
  } catch {
    return resolved
  }
  const recovered = missing.flatMap((request) => {
    const title = titleByIdentity.get(identityKey(request))
    return title ? [{ agent: request.agent, sessionId: request.sessionId, title }] : []
  })
  return recovered.length > 0 ? { titles: [...resolved.titles, ...recovered] } : resolved
}
