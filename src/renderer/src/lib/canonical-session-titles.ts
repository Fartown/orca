import { useSyncExternalStore } from 'react'
import {
  getSavedManualSessionTitle,
  getSavedManualSessionTitleIndex,
  subscribeSavedManualSessionTitles
} from '../session-names/terminal-manual-session-names'

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
let stopSavedNames: (() => void) | null = null
let lastProviderIndex: ReadonlyMap<string, string> | undefined
let lastSavedIndex: ReadonlyMap<string, string> | undefined
let mergedIndex: ReadonlyMap<string, string> = EMPTY_INDEX

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
  return (
    provider?.get(executionHostId, agent, sessionId) ??
    getSavedManualSessionTitle(executionHostId, agent, sessionId)
  )
}

/** Stable between notifications so useSyncExternalStore snapshots stay cached. */
export function getCanonicalSessionTitleIndex(): ReadonlyMap<string, string> {
  const providerIndex = provider?.index() ?? EMPTY_INDEX
  const savedIndex = getSavedManualSessionTitleIndex()
  if (providerIndex === lastProviderIndex && savedIndex === lastSavedIndex) {
    return mergedIndex
  }
  lastProviderIndex = providerIndex
  lastSavedIndex = savedIndex
  if (providerIndex.size === 0) {
    mergedIndex = savedIndex
    return mergedIndex
  }
  if (savedIndex.size === 0) {
    mergedIndex = providerIndex
    return mergedIndex
  }
  mergedIndex = new Map([...savedIndex, ...providerIndex])
  return mergedIndex
}

export function subscribeCanonicalSessionTitles(listener: () => void): () => void {
  listeners.add(listener)
  if (listeners.size === 1) {
    stopSavedNames = subscribeSavedManualSessionTitles(notify)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      stopSavedNames?.()
      stopSavedNames = null
    }
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
