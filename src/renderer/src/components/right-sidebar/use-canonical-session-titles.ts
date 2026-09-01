import { useCallback, useMemo, useSyncExternalStore } from 'react'
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
  const canonicalTitleIndex = useSyncExternalStore(
    subscribeCanonicalSessionTitles,
    getCanonicalSessionTitleIndex,
    getCanonicalSessionTitleIndex
  )
  const canonicalTitleBySessionKey = useMemo(() => {
    const map = new Map<string, string>()
    for (const [key, canonical] of canonicalTitleIndex) {
      map.set(key, canonical.title)
    }
    return map
  }, [canonicalTitleIndex])
  const getCanonicalTitle = useCallback(
    (session: AiVaultSession) =>
      canonicalTitleBySessionKey.get(
        canonicalSessionTitleKey(session.executionHostId, session.agent, session.sessionId)
      ),
    [canonicalTitleBySessionKey]
  )
  return { canonicalTitleBySessionKey, getCanonicalTitle }
}
