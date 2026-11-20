import type { RpcClient } from '../transport/rpc/rpc-client-contract'
import type { RpcResponse } from '../transport/rpc/rpc-wire-types'
import { worktreeCatalogRead } from '../worktree/catalog/worktree-catalog-operations'
import { WORKTREE_PS_FULL_LIMIT } from '../worktree/catalog/worktree-catalog-snapshot-client'

type Flight = { current: Promise<RpcResponse>; followUp: Promise<RpcResponse> | null }

const flights = new WeakMap<RpcClient, Map<string, Flight>>()

// Why: several task sheets read one host's catalog at once; upstream dropped per-operation single-flight,
// so local tasks keep one read out per client and host, plus one trailing read for triggers mid-flight.
export function requestLocalTaskWorktreeCatalog(
  client: RpcClient,
  hostId: string
): Promise<RpcResponse> {
  let byHost = flights.get(client)
  if (!byHost) {
    byHost = new Map()
    flights.set(client, byHost)
  }
  const hosts = byHost
  const existing = hosts.get(hostId)
  if (existing) {
    existing.followUp ??= existing.current.then(send, send)
    return existing.followUp
  }
  const flight: Flight = { current: send(), followUp: null }
  hosts.set(hostId, flight)
  const settle = (): void => {
    const followUp = flight.followUp
    if (followUp) {
      flight.current = followUp
      flight.followUp = null
      void followUp.then(settle, settle)
      return
    }
    if (hosts.get(hostId) === flight) {
      hosts.delete(hostId)
    }
  }
  void flight.current.then(settle, settle)
  return flight.current

  function send(): Promise<RpcResponse> {
    try {
      return worktreeCatalogRead.request(client, { limit: WORKTREE_PS_FULL_LIMIT })
    } catch (error) {
      return Promise.reject(error)
    }
  }
}
