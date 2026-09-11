import type { AiVaultTitleRequest } from '../lib/ai-vault-tab-title-requests'

export type BoundSessionNameRequest = AiVaultTitleRequest & { bindingRevision: number }

function sameBinding(left: AiVaultTitleRequest, right: AiVaultTitleRequest): boolean {
  return (
    left.executionHostId === right.executionHostId &&
    left.worktreeId === right.worktreeId &&
    left.agent === right.agent &&
    left.providerSession.id === right.providerSession.id &&
    left.providerSession.key === right.providerSession.key &&
    left.providerSession.transcriptPath === right.providerSession.transcriptPath &&
    left.paneKey === right.paneKey &&
    left.ptyId === right.ptyId &&
    left.terminalGeneration === right.terminalGeneration
  )
}

/** Observe every admitted binding transition, before background scans are coalesced. */
export function createSessionNameBindingTracker() {
  let nextRevision = 0
  let bindings = new Map<string, BoundSessionNameRequest>()
  const lastKnown = new Map<string, BoundSessionNameRequest>()
  return {
    get: (tabId: string) => bindings.get(tabId),
    forgetUnresolved: (tabId: string) => {
      if (!bindings.has(tabId)) {
        lastKnown.delete(tabId)
      }
    },
    observe(requests: AiVaultTitleRequest[], tabIds: ReadonlySet<string>) {
      for (const tabId of lastKnown.keys()) {
        if (!tabIds.has(tabId)) {
          lastKnown.delete(tabId)
        }
      }
      const previous = bindings
      bindings = new Map(
        requests.map((request) => {
          const prior = previous.get(request.tabId)
          return [
            request.tabId,
            {
              ...request,
              bindingRevision:
                prior && sameBinding(prior, request) ? prior.bindingRevision : ++nextRevision
            }
          ]
        })
      )
      const changed = [...bindings.values()].filter((request) => {
        const prior = lastKnown.get(request.tabId)
        return prior && prior.bindingRevision !== request.bindingRevision
      })
      const changedHost = changed.filter(
        (request) => lastKnown.get(request.tabId)?.executionHostId !== request.executionHostId
      )
      for (const request of bindings.values()) {
        lastKnown.set(request.tabId, request)
      }
      return {
        current: [...bindings.values()],
        removed: [...previous.values()].filter((request) => !bindings.has(request.tabId)),
        unresolved: [...lastKnown.values()].filter((request) => !bindings.has(request.tabId)),
        changed,
        changedHost
      }
    }
  }
}
