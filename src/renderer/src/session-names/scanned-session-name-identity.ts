import type { AiVaultSession } from '../../../shared/ai-vault-types'

/** Claude child transcripts may carry their parent's resumable session ID. */
export function hasIndependentScannedSessionIdentity(session: AiVaultSession): boolean {
  return !session.subagent || session.subagent.parentSessionId !== session.sessionId
}
