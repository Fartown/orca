import type { AiVaultSession } from '../../shared/ai-vault-types'
import type { SessionFileCandidate } from './session-scanner-types'
import { readCodexSessionIndexName } from './session-scanner-codex-title-index'
import {
  providerNameEvidenceEqual,
  readProviderNameEvidence,
  retainConfirmedProviderName,
  type ProviderNameReader
} from '../../shared/session-names/session-name-contract'

/**
 * Codex names a thread in <CODEX_HOME>/session_index.jsonl asynchronously,
 * after the rollout exists — often after the rollout's last append. A parse
 * cache keyed on the transcript's own mtime/size therefore freezes the fallback
 * title forever, so every reuse path re-derives it through here.
 *
 * Both caches share this: `session-scanner-parse-cache.ts` (local disk, via
 * `refreshCachedCodexTitle`) and `remote-session-parse-cache.ts` (relay
 * provider, whose reader lives in `remote-session-scanner-codex-index.ts`).
 */
export async function refreshCodexTitleFromIndex(
  session: AiVaultSession,
  readIndexedTitle: ProviderNameReader
): Promise<AiVaultSession> {
  const evidence = await readProviderNameEvidence(
    readIndexedTitle,
    session.sessionId,
    'session_index.thread_name'
  )
  const providerName = retainConfirmedProviderName(session.providerName, evidence)
  if (
    providerNameEvidenceEqual(session.providerName, providerName) &&
    (evidence.kind !== 'named' || evidence.title === session.title)
  ) {
    return session
  }
  return {
    ...session,
    ...(evidence.kind === 'named' ? { title: evidence.title } : {}),
    providerName
  }
}

export function refreshCachedCodexTitle(
  candidate: SessionFileCandidate,
  session: AiVaultSession
): Promise<AiVaultSession> {
  return refreshCodexTitleFromIndex(session, (sessionId) =>
    readCodexSessionIndexName(candidate.file.path, candidate.codexHome, sessionId)
  )
}
