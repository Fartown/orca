import { useCallback, useEffect } from 'react'
import { useSessionNameIndex } from '@/session-names/session-name-subscriptions'
import { getScannedSessionDisplayName } from '@/session-names/session-name-display'
import { sessionNameStore } from '@/session-names/session-name-store'
import { canonicalSessionTitleKey } from '@/lib/canonical-session-titles'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'

/** History supplies scanned evidence; the shared index drives rows and search. */
export function useCanonicalSessionTitles(sessions: readonly AiVaultSession[]): {
  canonicalTitleBySessionKey: ReadonlyMap<string, string>
  getCanonicalTitle: (session: AiVaultSession) => string | undefined
} {
  useEffect(() => sessionNameStore.seed(sessions), [sessions])
  const canonicalTitleBySessionKey = useSessionNameIndex([])
  const getCanonicalTitle = useCallback(
    (session: AiVaultSession) =>
      getScannedSessionDisplayName(
        session,
        canonicalTitleBySessionKey.get(
          canonicalSessionTitleKey(session.executionHostId, session.agent, session.sessionId)
        )
      ),
    [canonicalTitleBySessionKey]
  )
  return { canonicalTitleBySessionKey, getCanonicalTitle }
}
