import { AI_VAULT_SESSION_TITLE_REQUEST_MAX_COUNT } from '../../../../../../shared/ai-vault/contracts/ai-vault-session-title'
import type { ExecutionHostId } from '../../../../../../shared/execution-host/execution-host'
import { aiVaultTitleRequestKey } from './ai-vault-tab-title-freshness'
import type { AiVaultTitleRequest } from './ai-vault-tab-title-requests'

export function batchAiVaultTitleRequests<T extends { executionHostId: ExecutionHostId }>(
  requests: T[]
): T[][] {
  const byHost = new Map<ExecutionHostId, T[]>()
  for (const request of requests) {
    const hostRequests = byHost.get(request.executionHostId)
    if (hostRequests) {
      hostRequests.push(request)
    } else {
      byHost.set(request.executionHostId, [request])
    }
  }
  const batches: T[][] = []
  for (const hostRequests of byHost.values()) {
    for (
      let index = 0;
      index < hostRequests.length;
      index += AI_VAULT_SESSION_TITLE_REQUEST_MAX_COUNT
    ) {
      batches.push(hostRequests.slice(index, index + AI_VAULT_SESSION_TITLE_REQUEST_MAX_COUNT))
    }
  }
  return batches
}

/** Keeps only batch members whose tab request is still current when the batch's turn comes. */
export function currentAiVaultTitleRequests<T extends AiVaultTitleRequest>(
  currentRequestsByKey: () => ReadonlyMap<string, AiVaultTitleRequest>
): (batch: T[]) => T[] {
  return (batch) => {
    const current = currentRequestsByKey()
    return batch.filter((request) => {
      const live = current.get(aiVaultTitleRequestKey(request))
      return live && (!request.refresh || live.refresh)
    })
  }
}

export async function settleAiVaultTitleRequestBatches<
  T extends { executionHostId: ExecutionHostId }
>(
  requests: T[],
  resolveBatch: (batch: T[]) => Promise<void>,
  ownedRequests: (batch: T[]) => T[] = (batch) => batch
): Promise<void> {
  const batchesByHost = new Map<ExecutionHostId, T[][]>()
  for (const batch of batchAiVaultTitleRequests(requests)) {
    const executionHostId = batch[0]!.executionHostId
    const hostBatches = batchesByHost.get(executionHostId) ?? []
    hostBatches.push(batch)
    batchesByHost.set(executionHostId, hostBatches)
  }
  await Promise.all(
    [...batchesByHost.values()].map(async (hostBatches) => {
      for (const batch of hostBatches) {
        try {
          const owned = ownedRequests(batch)
          if (owned.length > 0) {
            await resolveBatch(owned)
          }
        } catch {
          // One unavailable host/batch must not suppress later exact identities.
        }
      }
    })
  )
}
