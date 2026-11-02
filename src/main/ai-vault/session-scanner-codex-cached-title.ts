import type { AiVaultSession } from '../../shared/ai-vault-types'
import type { SessionFileCandidate } from './session-scanner-types'
import { readCodexSessionIndexName } from './session-scanner-codex-title-index'
import {
  providerNameEvidenceEqual,
  readProviderNameEvidence,
  retainConfirmedProviderName,
  type ProviderNameReader
} from '../../shared/session-names/session-name-contract'

/** Refresh cached titles independently: session_index.jsonl can change after the rollout stops growing. */
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
