// Why: AI Vault surfaces show Orca-side conversation names without knowing who
// owns them; the owning domain registers a provider from its own composition
// root, so this module never imports domain code.
export type CanonicalSessionTitle = {
  title: string
  titleSource: 'minted' | 'provider' | 'user'
}

export type CanonicalSessionTitleProvider = {
  get(executionHostId: string, agent: string, sessionId: string): CanonicalSessionTitle | undefined
  index(): ReadonlyMap<string, CanonicalSessionTitle>
  subscribe(listener: () => void): () => void
}

const EMPTY_INDEX: ReadonlyMap<string, CanonicalSessionTitle> = new Map()
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
): CanonicalSessionTitle | undefined {
  return provider?.get(executionHostId, agent, sessionId)
}

/** Stable between notifications so useSyncExternalStore snapshots stay cached. */
export function getCanonicalSessionTitleIndex(): ReadonlyMap<string, CanonicalSessionTitle> {
  return provider?.index() ?? EMPTY_INDEX
}

export function subscribeCanonicalSessionTitles(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
