import { useEffect, useState } from 'react'
import { parseExecutionHostId } from '../../../src/shared/execution-host'
import { buildHostLabelById } from '../../../src/shared/worktree/host-context-labels'
import { hostSshTargetSummariesRead } from '../host-screen/host-screen-operations'
import type { RpcClient } from '../transport/rpc-client'
import { relayHostsFeed } from '../worktree/relay-hosts-feed'

/**
 * Names for the SSH hosts and servers a task's workspaces run on, read once from the desktop while
 * `client` is set and only when such a host is in play. A local host needs no lookup.
 */
export function useLocalTaskHostLabels(
  client: RpcClient | null,
  hostIds: readonly string[]
): ReadonlyMap<string, string> {
  const [labels, setLabels] = useState<ReadonlyMap<string, string>>(new Map())
  const kinds = new Set(hostIds.map((hostId) => parseExecutionHostId(hostId)?.kind))
  const wantsSsh = kinds.has('ssh')
  const wantsServers = kinds.has('runtime')
  useEffect(() => {
    if (!client || (!wantsSsh && !wantsServers)) {
      return
    }
    let current = true
    void Promise.all([
      wantsSsh
        ? hostSshTargetSummariesRead
            .request(client)
            .then((reply) => hostSshTargetSummariesRead.interpret(reply))
            .then((verdict) => (verdict.accepted ? verdict.value : []))
            .catch(() => [])
        : [],
      wantsServers ? relayHostsFeed(client).read() : null
    ]).then(([sshTargets, servers]) => {
      if (!current) {
        return
      }
      const next = new Map<string, string>(
        buildHostLabelById({ sshTargets, hostSettingOverrides: undefined })
      )
      for (const server of servers ?? []) {
        next.set(server.hostId, server.label)
      }
      setLabels(next)
    })
    return () => {
      current = false
    }
  }, [client, wantsSsh, wantsServers])
  return labels
}
