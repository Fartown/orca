import type {
  AiVaultSessionTitlesArgs,
  AiVaultSessionTitlesResult
} from '../../../shared/ai-vault-session-title'
import type { AppState } from '@/store/types'
import {
  collectAiVaultTitleRequests,
  type AiVaultTitleRequest
} from './ai-vault-tab-title-requests'
import { settleAiVaultTitleRequestBatches } from './ai-vault-tab-title-batches'
import { aiVaultTitleSyncInputsChanged } from './ai-vault-tab-title-sync-inputs'

const MISSING_TITLE_REFRESH_MS = 20_000
const LIVE_TITLE_REFRESH_MS = 5 * 60_000

function requestIdentity(request: AiVaultTitleRequest): string {
  return `${request.executionHostId}\0${request.agent}\0${request.providerSession.id}`
}

type SyncDependencies = {
  getState: () => AppState
  resolveSessionTitles: (args: AiVaultSessionTitlesArgs) => Promise<AiVaultSessionTitlesResult>
  subscribe: (listener: (state: AppState, previous: AppState) => void) => () => void
  // Optional Conversation renames outrank scanner values in the slot; the
  // subscription re-projects when a rename or Clear lands in the DB.
  getCanonicalTitle?: (executionHostId: string, agent: string, sessionId: string) => string | null
  subscribeCanonicalTitles?: (listener: () => void) => () => void
  scheduleReconcile?: (callback: () => void) => () => void
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout> | number
  clearTimer?: (timer: ReturnType<typeof setTimeout> | number) => void
}

function scheduleMicrotask(callback: () => void): () => void {
  let cancelled = false
  queueMicrotask(() => {
    if (!cancelled) {
      callback()
    }
  })
  return () => {
    cancelled = true
  }
}

type StoredSlotTitle =
  | {
      agent: string
      sessionId: string
      title: string
      source?: 'provider' | 'conversation-override'
    }
  | null
  | undefined

function collectStoredTitles(state: AppState): Map<string, StoredSlotTitle> {
  const byTabId = new Map<string, StoredSlotTitle>()
  for (const tabs of Object.values(state.tabsByWorktree)) {
    for (const tab of tabs) {
      byTabId.set(tab.id, tab.aiVaultTitle)
    }
  }
  return byTabId
}

function nextLiveRefreshDelay(state: AppState, requests: AiVaultTitleRequest[]): number | null {
  const liveRequests = requests.filter((request) => request.refresh)
  if (liveRequests.length === 0) {
    return null
  }
  const tabsById = new Map(
    Object.values(state.tabsByWorktree)
      .flat()
      .map((tab) => [tab.id, tab] as const)
  )
  const hasMissingTitle = liveRequests.some((request) => {
    const stored = tabsById.get(request.tabId)?.aiVaultTitle
    return (
      stored?.agent !== request.agent ||
      stored.sessionId !== request.providerSession.id ||
      !stored.title.trim()
    )
  })
  return hasMissingTitle ? MISSING_TITLE_REFRESH_MS : LIVE_TITLE_REFRESH_MS
}

export function startAiVaultTabTitleSync(dependencies: SyncDependencies): () => void {
  const setTimer = dependencies.setTimer ?? setTimeout
  const clearTimer =
    dependencies.clearTimer ??
    ((timer: ReturnType<typeof setTimeout> | number) =>
      clearTimeout(timer as ReturnType<typeof setTimeout>))
  let refreshTimer: ReturnType<typeof setTimeout> | number | null = null
  let scanInFlight = false
  let scanAgain = false
  let scheduled = false
  let cancelScheduled: (() => void) | null = null
  let stopped = false
  let writing = false
  let firstReconcile = true
  // Kept for mixed-version peers that may strip the optional slot source.
  const canonicalProjectedTabIds = new Set<string>()

  const canonicalFor = (request: AiVaultTitleRequest): string | null =>
    dependencies.getCanonicalTitle?.(
      request.executionHostId,
      request.agent,
      request.providerSession.id
    ) ?? null

  // The single slot write point. The optional source makes Clear/Forget
  // reversible across restart without changing the existing title slot.
  const writeTitle = (request: AiVaultTitleRequest, title: string | null): void => {
    const canonical = canonicalFor(request)
    const resolved = canonical ?? title
    if (canonical) {
      canonicalProjectedTabIds.add(request.tabId)
    } else {
      canonicalProjectedTabIds.delete(request.tabId)
    }
    writing = true
    try {
      dependencies.getState().setAiVaultTabTitle(
        request.tabId,
        resolved
          ? {
              agent: request.agent,
              sessionId: request.providerSession.id,
              title: resolved,
              source: canonical ? ('conversation-override' as const) : ('provider' as const)
            }
          : null
      )
    } finally {
      writing = false
    }
  }

  const resolveBatch = async (requests: AiVaultTitleRequest[]): Promise<void> => {
    const first = requests[0]!
    const result = await dependencies.resolveSessionTitles({
      executionHostScope: first.executionHostId,
      requests: requests.map((request) => ({
        agent: request.agent,
        sessionId: request.providerSession.id,
        ...(request.providerSession.transcriptPath
          ? { transcriptPath: request.providerSession.transcriptPath }
          : {})
      }))
    })
    if (stopped) {
      return
    }
    const titleByIdentity = new Map<string, string>()
    for (const title of result.titles) {
      if (title.title.trim()) {
        titleByIdentity.set(
          `${first.executionHostId}\0${title.agent}\0${title.sessionId}`,
          title.title.trim()
        )
      }
    }
    const currentByTabId = new Map(
      collectAiVaultTitleRequests(dependencies.getState()).map((request) => [
        request.tabId,
        request
      ])
    )
    for (const request of requests) {
      const title = titleByIdentity.get(requestIdentity(request))
      // Why: the pane identity flips while the agent runs a background side call,
      // and the scan above is async — re-checking the identity here would discard
      // the name just resolved for this tab's real session. The slot records the
      // identity it holds, so a genuine session switch is corrected by the next
      // reconcile rather than losing this result.
      if (title && currentByTabId.has(request.tabId)) {
        writeTitle(request, title)
      }
    }
  }

  const reconcile = async (): Promise<void> => {
    scheduled = false
    if (stopped) {
      return
    }
    if (scanInFlight) {
      scanAgain = true
      return
    }
    if (refreshTimer !== null) {
      clearTimer(refreshTimer)
      refreshTimer = null
    }

    const requests = collectAiVaultTitleRequests(dependencies.getState())
    // User-override pass, ahead of the scan filter: retained and
    // sleeping candidates never rescan once the slot holds a matching name,
    // so Rename/Clear must be projected here directly. When an override this
    // pass once projected disappears,
    // the slot is cleared so the scan below restores the scanner value.
    const storedBeforePass = collectStoredTitles(dependencies.getState())
    for (const request of requests) {
      const canonical = canonicalFor(request)
      const stored = storedBeforePass.get(request.tabId)
      if (canonical) {
        canonicalProjectedTabIds.add(request.tabId)
        if (
          stored?.agent !== request.agent ||
          stored.sessionId !== request.providerSession.id ||
          stored.title !== canonical ||
          stored.source !== 'conversation-override'
        ) {
          writeTitle(request, canonical)
        }
      } else if (
        stored &&
        canonicalProjectedTabIds.has(request.tabId) &&
        stored.agent === request.agent &&
        stored.sessionId === request.providerSession.id
      ) {
        // Same identity, override gone: the user cleared it, so hand the slot back to the scan.
        canonicalProjectedTabIds.delete(request.tabId)
        writeTitle(request, null)
      }
    }

    const storedAfterPass = collectStoredTitles(dependencies.getState())
    // Why: the pane identity flips whenever the agent runs a background side call
    // (title generation, catch-up recap) in the same pane, and those never resolve
    // to a name. A mismatch only reopens the scan; resolveBatch replaces the slot
    // once the new identity actually resolves, so the last good name never drops.
    const requestsToScan = requests.filter((request) => {
      const stored = storedAfterPass.get(request.tabId)
      const identityMatches =
        stored?.agent === request.agent && stored.sessionId === request.providerSession.id
      return (
        request.refresh ||
        !identityMatches ||
        !stored?.title.trim() ||
        (firstReconcile && stored.source !== 'provider' && !canonicalFor(request))
      )
    })
    firstReconcile = false

    if (requestsToScan.length > 0) {
      scanInFlight = true
      await settleAiVaultTitleRequestBatches(requestsToScan, resolveBatch)
      scanInFlight = false
    }

    if (scanAgain) {
      scanAgain = false
      schedule()
    } else if (!stopped) {
      const currentState = dependencies.getState()
      const currentRequests = collectAiVaultTitleRequests(currentState)
      const refreshDelay = nextLiveRefreshDelay(currentState, currentRequests)
      if (refreshDelay !== null) {
        refreshTimer = setTimer(schedule, refreshDelay)
      }
    }
  }

  function schedule(): void {
    if (scheduled || stopped) {
      return
    }
    scheduled = true
    cancelScheduled = (dependencies.scheduleReconcile ?? scheduleMicrotask)(() => {
      cancelScheduled = null
      void reconcile()
    })
  }

  const unsubscribe = dependencies.subscribe((state, previous) => {
    if (!writing && aiVaultTitleSyncInputsChanged(state, previous)) {
      schedule()
    }
  })
  const unsubscribeCanonical = dependencies.subscribeCanonicalTitles?.(schedule) ?? null
  schedule()

  return () => {
    stopped = true
    unsubscribe()
    unsubscribeCanonical?.()
    cancelScheduled?.()
    cancelScheduled = null
    if (refreshTimer !== null) {
      clearTimer(refreshTimer)
    }
  }
}
