import { extname } from 'node:path'
import { hasUnsafeProviderSessionIdChars } from '../../shared/agent-session-resume'
import {
  AI_VAULT_SESSION_TITLE_REQUEST_MAX_COUNT,
  type AiVaultSessionTitleRequest,
  type AiVaultSessionTitlesResult
} from '../../shared/ai-vault-session-title'
import { listAiVaultSessions } from './cached-session-list'
import { resolveAiVaultSessionTitlesInBackground } from './session-scanner-background'
import type { AiVaultSession } from '../../shared/ai-vault-types'

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
  let sessionByIdentity: Map<string, AiVaultSession>
  try {
    // Default depth, so a panel scan already in cache covers this without rescanning.
    const { sessions } = await listAiVaultSessions(undefined, { signal })
    sessionByIdentity = new Map(sessions.map((session) => [identityKey(session), session]))
  } catch {
    return resolved
  }
  const recovered = missing.flatMap((request) => {
    const session = sessionByIdentity.get(identityKey(request))
    const title = session?.title.trim()
    return title
      ? [
          {
            agent: request.agent,
            sessionId: request.sessionId,
            title,
            ...(session?.providerName ? { providerName: session.providerName } : {}),
            ...(session?.generatedTitle !== undefined
              ? { generatedTitle: session.generatedTitle }
              : {})
          }
        ]
      : []
  })
  if (recovered.length === 0) {
    return resolved
  }
  const nameEvidence = new Map(
    (resolved.nameEvidence ?? []).map((entry) => [identityKey(entry), entry])
  )
  for (const title of recovered) {
    if (title.providerName) {
      nameEvidence.set(identityKey(title), {
        agent: title.agent,
        sessionId: title.sessionId,
        providerName: title.providerName,
        ...(title.generatedTitle !== undefined ? { generatedTitle: title.generatedTitle } : {})
      })
    }
  }
  return {
    titles: [...resolved.titles, ...recovered],
    ...(nameEvidence.size ? { nameEvidence: [...nameEvidence.values()] } : {})
  }
}
