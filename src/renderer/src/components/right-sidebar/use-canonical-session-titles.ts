import { useCallback, useSyncExternalStore } from 'react'
import {
  canonicalSessionTitleKey,
  getCanonicalSessionTitleIndex,
  subscribeCanonicalSessionTitles
} from '@/lib/canonical-session-titles'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'

/** Canonical Orca-side names for history rows: a search haystack plus a per-session lookup. */
export function useCanonicalSessionTitles(): {
  canonicalTitleBySessionKey: ReadonlyMap<string, string>
  getCanonicalTitle: (session: AiVaultSession) => string | undefined
} {
  // The provider index already maps identity keys to plain titles, so it
  // feeds the search filter directly without a per-change copy.
  const canonicalTitleBySessionKey = useSyncExternalStore(
    subscribeCanonicalSessionTitles,
    getCanonicalSessionTitleIndex,
    getCanonicalSessionTitleIndex
  )
  const getCanonicalTitle = useCallback(
    (session: AiVaultSession) =>
      canonicalTitleBySessionKey.get(
        canonicalSessionTitleKey(session.executionHostId, session.agent, session.sessionId)
      ),
    [canonicalTitleBySessionKey]
  )
  return { canonicalTitleBySessionKey, getCanonicalTitle }
}
