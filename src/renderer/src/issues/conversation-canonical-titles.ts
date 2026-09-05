import {
  canonicalSessionTitleKey,
  registerCanonicalSessionTitleProvider
} from '@/lib/canonical-session-titles'
import { issueDomainStore } from './issues-domain-store'

type PartitionMap = ReturnType<typeof issueDomainStore.getState>['partitionsByRouteExecutionHostId']

// Keyed by route + agent + provider session id — the identity triple both the
// tab title sync and the right-side history rows already carry. Every store
// commit replaces the partitions object, but untouched partitions keep their
// identity, so per-partition sub-indexes are reused and only the changed
// partition is re-walked.
const indexCache = new WeakMap<object, ReadonlyMap<string, string>>()
const partitionIndexCache = new WeakMap<object, ReadonlyMap<string, string>>()
// Reused when a partitions commit produced no title changes, so subscribers
// (vault filter, tab-title reconcile) only re-run on real title updates.
let lastMergedIndex: ReadonlyMap<string, string> | null = null

type Partition = NonNullable<PartitionMap[keyof PartitionMap]>

function partitionTitleIndex(route: string, partition: Partition): ReadonlyMap<string, string> {
  const cached = partitionIndexCache.get(partition)
  if (cached) {
    return cached
  }
  const index = new Map<string, string>()
  for (const conversation of Object.values(partition.conversationsById)) {
    const sessionId = conversation.navigation?.providerSession?.id
    const title = conversation.title?.trim()
    const isUserOverride = conversation.titleSource === 'user' || conversation.titleSource == null
    if (!sessionId || !title || !isUserOverride) {
      continue
    }
    index.set(canonicalSessionTitleKey(route, conversation.agent, sessionId), title)
  }
  partitionIndexCache.set(partition, index)
  return index
}

function canonicalTitleIndex(partitions: PartitionMap): ReadonlyMap<string, string> {
  const cached = indexCache.get(partitions)
  if (cached) {
    return cached
  }
  let index: ReadonlyMap<string, string> = new Map<string, string>()
  for (const [route, partition] of Object.entries(partitions)) {
    if (!partition) {
      continue
    }
    for (const [key, value] of partitionTitleIndex(route, partition)) {
      ;(index as Map<string, string>).set(key, value)
    }
  }
  if (lastMergedIndex && sameIndex(lastMergedIndex, index)) {
    index = lastMergedIndex
  }
  lastMergedIndex = index
  indexCache.set(partitions, index)
  return index
}

function sameIndex(left: ReadonlyMap<string, string>, right: ReadonlyMap<string, string>): boolean {
  if (left.size !== right.size) {
    return false
  }
  for (const [key, value] of right) {
    if (left.get(key) !== value) {
      return false
    }
  }
  return true
}

/** Registers only user overrides; automatic names stay owned by AI Vault. */
export function registerConversationCanonicalTitles(): () => void {
  return registerCanonicalSessionTitleProvider({
    get: (executionHostId, agent, sessionId) =>
      canonicalTitleIndex(issueDomainStore.getState().partitionsByRouteExecutionHostId).get(
        canonicalSessionTitleKey(executionHostId, agent, sessionId)
      ),
    index: () => canonicalTitleIndex(issueDomainStore.getState().partitionsByRouteExecutionHostId),
    subscribe: (listener) => {
      // Notify on index identity, not store identity: poll ticks bump the
      // partitions object every few seconds while titles rarely change, and
      // each notification re-runs the vault filter and a tab-title reconcile.
      let previous = canonicalTitleIndex(
        issueDomainStore.getState().partitionsByRouteExecutionHostId
      )
      return issueDomainStore.subscribe((state) => {
        const next = canonicalTitleIndex(state.partitionsByRouteExecutionHostId)
        if (next !== previous) {
          previous = next
          listener()
        }
      })
    }
  })
}
