import { useCallback, useEffect, useState } from 'react'
import { parseExecutionHostId } from '../../../src/shared/execution-host'
import { sshRepoStateRead } from '../tasks/mobile-workspace-source-operations'
import type { RpcClient } from '../transport/rpc-client'
import type { LocalTaskEndpoint } from './local-task-endpoint'

export type LocalTaskHostContact =
  | { kind: 'in-contact' }
  /** The library's host says it cannot reach this host now; it is not reconnected for the user. */
  | { kind: 'out-of-contact' }
  /** Nobody answered; no host action is safe until contact is confirmed. */
  | { kind: 'unverifiable' }

/**
 * Whether a workspace's host is in contact, asked once when the user acts. The library's own
 * machine is whenever its client is; the paired host answers for its own SSH targets. A server
 * judges its own SSH targets when the action reaches it, so the phone only needs the relay.
 */
export async function readLocalTaskHostContact(
  client: RpcClient | null,
  endpoint: LocalTaskEndpoint,
  ownerHostId: string
): Promise<LocalTaskHostContact> {
  if (!client || client.getState() !== 'connected') {
    return { kind: 'unverifiable' }
  }
  const host = parseExecutionHostId(ownerHostId)
  if (host?.kind !== 'ssh' || endpoint.executionHost) {
    return { kind: 'in-contact' }
  }
  try {
    const state = sshRepoStateRead.interpret(
      await sshRepoStateRead.request(client, { targetId: host.targetId })
    )
    return state?.status === 'connected' ? { kind: 'in-contact' } : { kind: 'out-of-contact' }
  } catch {
    return { kind: 'unverifiable' }
  }
}

/** A contact snapshot, read again whenever the client's connection changes. */
export function useLocalTaskHostContact(
  client: RpcClient | null,
  endpoint: LocalTaskEndpoint,
  hostId: string | null
) {
  const [snapshot, setSnapshot] = useState<{
    client: RpcClient
    hostId: string
    contact: LocalTaskHostContact
  } | null>(null)
  const refresh = useCallback(() => {
    if (!client || !hostId) {
      return
    }
    void readLocalTaskHostContact(client, endpoint, hostId).then((contact) => {
      setSnapshot({ client, hostId, contact })
    })
  }, [client, endpoint, hostId])
  useEffect(() => {
    refresh()
    if (!client) {
      return
    }
    return client.onStateChange(() => refresh())
  }, [client, refresh])
  return {
    contact:
      snapshot?.client === client && snapshot.hostId === hostId
        ? snapshot.contact
        : { kind: 'unverifiable' as const },
    refresh
  }
}
