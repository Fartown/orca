import type {
  AiVaultSessionTitle,
  AiVaultSessionTitlesResult
} from '../../../shared/ai-vault/contracts/ai-vault-session-title'
import type { SessionNameEvidence } from '../../../shared/session-names/session-name-contract'
import { projectSessionNameSlot } from '../../../shared/session-names/session-name-slot'
import type { AppState } from '../store/types'
import type { AiVaultTitleRequest } from '../lib/agent-session/history/title-sync/ai-vault-tab-title-requests'
import {
  aiVaultTitleRequestKey,
  storedAiVaultTitles
} from '../lib/agent-session/history/title-sync/ai-vault-tab-title-freshness'
import {
  createSessionNameBindingTracker,
  type BoundSessionNameRequest
} from './session-name-binding'
import { sessionNamePaneWasReplaced } from './session-name-pane-binding'
import { projectSessionPromptTitles } from './session-name-prompt-projection'

export type SessionNameTabTitleDependencies = {
  getState: () => AppState
  // Legacy manual names are a fallback candidate, never a native-name override.
  getCanonicalTitle?: (executionHostId: string, agent: string, sessionId: string) => string | null
  subscribeCanonicalTitles?: (listener: () => void) => () => void
  subscribeSessionNames?: (listener: () => void) => () => void
  getSessionName?: (request: AiVaultTitleRequest) => AiVaultSessionTitle | undefined
  invalidateSessionNames?: (requests: AiVaultTitleRequest[]) => void
}

function collectTabIds(state: AppState): Set<string> {
  const tabIds = new Set<string>()
  for (const tabs of Object.values(state.tabsByWorktree)) {
    for (const tab of tabs) {
      tabIds.add(tab.id)
    }
  }
  return tabIds
}

/** Session-name side of the tab title sync: pane bindings, slot projection, and name subscriptions. */
export function createSessionNameTabTitleProjection(args: {
  dependencies: SessionNameTabTitleDependencies
  currentRequests: (state: AppState) => AiVaultTitleRequest[]
  // Store writes made here must not re-enter the sync's own subscriber.
  whileWriting: (write: () => void) => void
  /** A rebound pane rejects responses read for its old binding, so its request key is read again. */
  rereadKeys?: Set<string>
}) {
  const { dependencies, currentRequests, whileWriting } = args
  const bindings = createSessionNameBindingTracker()

  const observe = (): BoundSessionNameRequest[] => {
    const state = dependencies.getState()
    const update = bindings.observe(currentRequests(state), collectTabIds(state))
    dependencies.invalidateSessionNames?.([...update.changed, ...update.removed])
    for (const request of update.changed) {
      args.rereadKeys?.add(aiVaultTitleRequestKey(request))
    }
    const replaced = update.unresolved.filter((request) =>
      sessionNamePaneWasReplaced(state, request)
    )
    whileWriting(() => {
      for (const request of [...replaced, ...update.changedHost]) {
        bindings.forgetUnresolved(request.tabId)
        dependencies.getState().setAiVaultTabTitle(request.tabId, null)
      }
    })
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
    const previous = storedAiVaultTitles(dependencies.getState(), [request])(request)
    const projected = projectSessionNameSlot({
      agent: request.agent,
      sessionId: request.providerSession.id,
      previous,
      title,
      evidence,
      manualTitle: canonicalFor(request)
    })
    whileWriting(() => dependencies.getState().setAiVaultTabTitle(request.tabId, projected))
  }

  const projectFallbackTitles = (requests: AiVaultTitleRequest[]): void => {
    const storedTitles = storedAiVaultTitles(dependencies.getState(), requests)
    for (const request of requests) {
      const stored = storedTitles(request)
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

  /** An old response cannot rename a pane whose admitted binding changed meanwhile. */
  const isCurrentBinding = (request: BoundSessionNameRequest): boolean =>
    bindings.get(request.tabId)?.bindingRevision === request.bindingRevision

  /** Lands one host batch's native names and evidence on tabs that still own the same binding. */
  const writeResolved = (
    requests: BoundSessionNameRequest[],
    result: AiVaultSessionTitlesResult,
    stillRequested: (request: BoundSessionNameRequest) => boolean
  ): void => {
    const host = requests[0]!.executionHostId
    const identity = (agent: string, sessionId: string): string => `${host}\0${agent}\0${sessionId}`
    const titles = new Map(
      result.titles
        .filter((title) => title.title.trim())
        .map((title) => [identity(title.agent, title.sessionId), title])
    )
    const evidence = new Map(
      (result.nameEvidence ?? []).map((entry) => [identity(entry.agent, entry.sessionId), entry])
    )
    for (const request of requests) {
      const key = identity(request.agent, request.providerSession.id)
      const title = titles.get(key)
      const entry = evidence.get(key)
      if ((title || entry) && stillRequested(request) && isCurrentBinding(request)) {
        writeTitle(request, title, entry)
      }
    }
  }

  const subscribe = (callbacks: {
    isStopped: () => boolean
    onNamesChanged: () => void
  }): (() => void) => {
    // Known names must not wait for input quiet or an unrelated host's file read.
    const unsubscribeCanonical = dependencies.subscribeCanonicalTitles?.(() => {
      if (!callbacks.isStopped()) {
        projectFallbackTitles(currentRequests(dependencies.getState()))
      }
    })
    const unsubscribeNames = dependencies.subscribeSessionNames?.(() => {
      if (callbacks.isStopped()) {
        return
      }
      for (const request of observe()) {
        const title = dependencies.getSessionName?.(request)
        if (title?.agent === request.agent && title.sessionId === request.providerSession.id) {
          writeTitle(request, title)
        }
      }
      callbacks.onNamesChanged()
    })
    observe()
    return () => {
      unsubscribeCanonical?.()
      unsubscribeNames?.()
    }
  }

  return { observe, writeResolved, projectFallbackTitles, subscribe }
}
