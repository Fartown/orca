import { useSyncExternalStore } from 'react'

// AI Vault surfaces consume optional user overrides without knowing which
// domain owns them. Absence means use the native Provider title chain.
export type CanonicalSessionTitleProvider = {
  get(executionHostId: string, agent: string, sessionId: string): string | undefined
  index(): ReadonlyMap<string, string>
  subscribe(listener: () => void): () => void
}

const EMPTY_INDEX: ReadonlyMap<string, string> = new Map()
const listeners = new Set<() => void>()
let provider: CanonicalSessionTitleProvider | null = null
let stopProvider: (() => void) | null = null

function notify(): void {
  for (const listener of listeners) {
    listener()
  }
}

export function registerCanonicalSessionTitleProvider(
  next: CanonicalSessionTitleProvider
): () => void {
  stopProvider?.()
  provider = next
  stopProvider = next.subscribe(notify)
  notify()
  return () => {
    if (provider !== next) {
      return
    }
    stopProvider?.()
    stopProvider = null
    provider = null
    notify()
  }
}

export function canonicalSessionTitleKey(
  executionHostId: string,
  agent: string,
  sessionId: string
): string {
  return `${executionHostId}\0${agent}\0${sessionId}`
}

export function getCanonicalSessionTitle(
  executionHostId: string,
  agent: string,
  sessionId: string
): string | undefined {
  return provider?.get(executionHostId, agent, sessionId)
}

/** Stable between notifications so useSyncExternalStore snapshots stay cached. */
export function getCanonicalSessionTitleIndex(): ReadonlyMap<string, string> {
  return provider?.index() ?? EMPTY_INDEX
}

export function subscribeCanonicalSessionTitles(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useCanonicalSessionTitle(
  executionHostId: string | null | undefined,
  agent: string | null | undefined,
  sessionId: string | null | undefined
): string | undefined {
  return useSyncExternalStore(
    subscribeCanonicalSessionTitles,
    () =>
      executionHostId && agent && sessionId
        ? getCanonicalSessionTitle(executionHostId, agent, sessionId)
        : undefined,
    () => undefined
  )
}
