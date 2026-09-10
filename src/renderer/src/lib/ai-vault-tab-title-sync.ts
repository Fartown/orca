import type {
  AiVaultSessionTitle,
  AiVaultSessionTitlesArgs,
  AiVaultSessionTitlesResult
} from '../../../shared/ai-vault-session-title'
import type { SessionNameEvidence } from '../../../shared/session-names/session-name-contract'
import { projectSessionNameSlot } from '../../../shared/session-names/session-name-slot'
import type { AppState } from '@/store/types'
import {
  createSessionNameBindingTracker,
  type BoundSessionNameRequest
} from '../session-names/session-name-binding'
import {
  collectAiVaultTitleRequests,
  type AiVaultTitleRequest
} from './ai-vault-tab-title-requests'
import { settleAiVaultTitleRequestBatches } from './ai-vault-tab-title-batches'
import { aiVaultTitleSyncInputsChanged } from './ai-vault-tab-title-sync-inputs'
import { sessionNamePaneWasReplaced } from '../session-names/session-name-pane-binding'
import { projectSessionPromptTitles } from '../session-names/session-name-prompt-projection'

const MISSING_TITLE_REFRESH_MS = 20_000
const LIVE_TITLE_REFRESH_MS = 5 * 60_000

function requestIdentity(request: AiVaultTitleRequest): string {
  return `${request.executionHostId}\0${request.agent}\0${request.providerSession.id}`
}

type SyncDependencies = {
  getState: () => AppState
  resolveSessionTitles: (args: AiVaultSessionTitlesArgs) => Promise<AiVaultSessionTitlesResult>
  subscribe: (listener: (state: AppState, previous: AppState) => void) => () => void
  // Legacy manual names are a fallback candidate, never a native-name override.
  getCanonicalTitle?: (executionHostId: string, agent: string, sessionId: string) => string | null
  subscribeCanonicalTitles?: (listener: () => void) => () => void
  subscribeSessionNames?: (listener: () => void) => () => void
  getSessionName?: (request: AiVaultTitleRequest) => AiVaultSessionTitle | undefined
  invalidateSessionNames?: (requests: AiVaultTitleRequest[]) => void
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

type StoredSlotTitle = AiVaultSessionTitle | null | undefined

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
      stored.providerName?.kind !== 'named'
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
  let nameCacheChanged = false
  const bindings = createSessionNameBindingTracker()

  const observeBindings = (): BoundSessionNameRequest[] => {
    const state = dependencies.getState()
    const update = bindings.observe(
      collectAiVaultTitleRequests(state),
      new Set(collectStoredTitles(state).keys())
    )
    dependencies.invalidateSessionNames?.([...update.changed, ...update.removed])
    const replaced = update.unresolved.filter((request) =>
      sessionNamePaneWasReplaced(state, request)
    )
    writing = true
    try {
      for (const request of [...replaced, ...update.changedHost]) {
        bindings.forgetUnresolved(request.tabId)
        dependencies.getState().setAiVaultTabTitle(request.tabId, null)
      }
    } finally {
      writing = false
    }
    return update.current
  }

  const canonicalFor = (request: AiVaultTitleRequest): string | null =>
    dependencies.getCanonicalTitle?.(
      request.executionHostId,
      request.agent,
      request.providerSession.id
    ) ?? null

  const writeTitle = (
    request: AiVaultTitleRequest,
    title?: AiVaultSessionTitle,
    evidence?: SessionNameEvidence
  ): void => {
    const previous = collectStoredTitles(dependencies.getState()).get(request.tabId)
    const projected = projectSessionNameSlot({
      agent: request.agent,
      sessionId: request.providerSession.id,
      previous,
      title,
      evidence,
      manualTitle: canonicalFor(request)
    })
    writing = true
    try {
      dependencies.getState().setAiVaultTabTitle(request.tabId, projected)
    } finally {
      writing = false
    }
  }

  const projectFallbackTitles = (requests: AiVaultTitleRequest[]): void => {
    const storedTitles = collectStoredTitles(dependencies.getState())
    for (const request of requests) {
      const stored = storedTitles.get(request.tabId)
      const sameSession =
        stored?.agent === request.agent && stored.sessionId === request.providerSession.id
      const oldManual = sameSession
        ? (stored.manualTitle ?? (stored.source === 'conversation-override' ? stored.title : null))
        : null
      if (!sameSession || canonicalFor(request) !== oldManual) {
        writeTitle(request)
      }
    }
    projectSessionPromptTitles(dependencies.getState(), requests)
  }

  const resolveBatch = async (requests: BoundSessionNameRequest[]): Promise<void> => {
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
    const titleByIdentity = new Map<string, AiVaultSessionTitle>()
    for (const title of result.titles) {
      if (title.title.trim()) {
        titleByIdentity.set(`${first.executionHostId}\0${title.agent}\0${title.sessionId}`, title)
      }
    }
    const evidenceByIdentity = new Map(
      (result.nameEvidence ?? []).map((entry) => [
        `${first.executionHostId}\0${entry.agent}\0${entry.sessionId}`,
        entry
      ])
    )
    for (const request of requests) {
      const title = titleByIdentity.get(requestIdentity(request))
      const evidence = evidenceByIdentity.get(requestIdentity(request))
      const current = bindings.get(request.tabId)
      // Ownership is admitted upstream; an old response cannot rename a replacement pane.
      if ((title || evidence) && current && current.bindingRevision === request.bindingRevision) {
        writeTitle(request, title, evidence)
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

    const requests = observeBindings()
    projectFallbackTitles(requests)

    const storedAfterPass = collectStoredTitles(dependencies.getState())
    const requestsToScan = requests.filter((request) => {
      const stored = storedAfterPass.get(request.tabId)
      const identityMatches =
        stored?.agent === request.agent && stored.sessionId === request.providerSession.id
      return (
        request.refresh ||
        nameCacheChanged ||
        !identityMatches ||
        !stored?.title.trim() ||
        (firstReconcile && !stored.providerName)
      )
    })
    firstReconcile = false
    nameCacheChanged = false

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
      projectFallbackTitles(observeBindings())
      schedule()
    }
  })
  // Known names must not wait for input quiet or an unrelated host's file read.
  const unsubscribeCanonical =
    dependencies.subscribeCanonicalTitles?.(() => {
      if (!stopped) {
        projectFallbackTitles(collectAiVaultTitleRequests(dependencies.getState()))
      }
    }) ?? null
  const unsubscribeNames = dependencies.subscribeSessionNames?.(() => {
    if (stopped) {
      return
    }
    for (const request of observeBindings()) {
      const title = dependencies.getSessionName?.(request)
      if (title?.agent === request.agent && title.sessionId === request.providerSession.id) {
        writeTitle(request, title)
      }
    }
    nameCacheChanged = true
    schedule()
  })
  observeBindings()
  schedule()

  return () => {
    stopped = true
    unsubscribe()
    unsubscribeCanonical?.()
    unsubscribeNames?.()
    cancelScheduled?.()
    cancelScheduled = null
    if (refreshTimer !== null) {
      clearTimer(refreshTimer)
    }
  }
}
