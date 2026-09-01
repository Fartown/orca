import {
  canonicalSessionTitleKey,
  registerCanonicalSessionTitleProvider,
  type CanonicalSessionTitle
} from '@/lib/canonical-session-titles'
import { issueDomainStore } from './issues-domain-store'

type PartitionMap = ReturnType<typeof issueDomainStore.getState>['partitionsByRouteExecutionHostId']

// Keyed by route + agent + provider session id — the identity triple both the
// tab title sync and the right-side history rows already carry. Rebuilt only
// when the partitions object identity changes (every store commit replaces it).
const indexCache = new WeakMap<object, ReadonlyMap<string, CanonicalSessionTitle>>()

function canonicalTitleIndex(partitions: PartitionMap): ReadonlyMap<string, CanonicalSessionTitle> {
  const cached = indexCache.get(partitions)
  if (cached) {
    return cached
  }
  const index = new Map<string, CanonicalSessionTitle>()
  for (const [route, partition] of Object.entries(partitions)) {
    if (!partition) {
      continue
    }
    for (const conversation of Object.values(partition.conversationsById)) {
      const sessionId = conversation.navigation?.providerSession?.id
      const title = conversation.title?.trim()
      if (!sessionId || !title) {
        continue
      }
      index.set(canonicalSessionTitleKey(route, conversation.agent, sessionId), {
        title,
        titleSource: conversation.titleSource ?? 'user'
      })
    }
  }
  indexCache.set(partitions, index)
  return index
}

/** Registers Conversation names as the app-wide canonical session titles. */
export function registerConversationCanonicalTitles(): () => void {
  return registerCanonicalSessionTitleProvider({
    get: (executionHostId, agent, sessionId) =>
      canonicalTitleIndex(issueDomainStore.getState().partitionsByRouteExecutionHostId).get(
        canonicalSessionTitleKey(executionHostId, agent, sessionId)
      ),
    index: () => canonicalTitleIndex(issueDomainStore.getState().partitionsByRouteExecutionHostId),
    subscribe: (listener) => {
      let previous = issueDomainStore.getState().partitionsByRouteExecutionHostId
      return issueDomainStore.subscribe((state) => {
        if (state.partitionsByRouteExecutionHostId !== previous) {
          previous = state.partitionsByRouteExecutionHostId
          listener()
        }
      })
    }
  })
}
