import { useEffect, useRef, useSyncExternalStore } from 'react'
import { sessionNameStore, type SessionNameRequest } from './session-name-store'
import { getSessionNameDisplayIndex, subscribeSessionNameDisplay } from './session-name-display'
import { canonicalSessionTitleKey } from '../lib/canonical-session-titles'

export function useSessionNameRecord(request: SessionNameRequest | null) {
  useSessionNameIndex(request ? [request] : [])
  return request
    ? sessionNameStore
        .getSnapshot()
        .get(canonicalSessionTitleKey(request.executionHostId, request.agent, request.sessionId))
    : undefined
}

export function useSessionNameIndex(
  requests: readonly SessionNameRequest[]
): ReadonlyMap<string, string> {
  const index = useSyncExternalStore(
    subscribeSessionNameDisplay,
    getSessionNameDisplayIndex,
    getSessionNameDisplayIndex
  )
  const requestKey = JSON.stringify(requests)
  const latest = useRef(requests)
  useEffect(() => {
    latest.current = requests
  }, [requests])
  useEffect(() => {
    const subscription = sessionNameStore.watch(latest.current)
    return () => subscription.unsubscribe()
  }, [requestKey])
  return index
}
