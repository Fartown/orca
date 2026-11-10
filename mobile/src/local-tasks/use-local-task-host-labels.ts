import { useEffect, useState } from 'react'
import { parseExecutionHostId } from '../../../src/shared/execution-host'
import {
  buildHostLabelById,
  sshTargetSummaryHostId
} from '../../../src/shared/worktree/host-context-labels'
import { hostSshTargetSummariesRead } from '../host-screen/host-screen-operations'
import type { RpcClient } from '../transport/rpc-client'
import { relayHostsFeed } from '../worktree/relay-hosts-feed'

export type LocalTaskHostDirectory = {
  labels: ReadonlyMap<string, string>
  /** The paired host's own word on its SSH targets; absent when it gave none. */
  connected: ReadonlyMap<string, boolean>
}

const EMPTY_DIRECTORY: LocalTaskHostDirectory = { labels: new Map(), connected: new Map() }

/**
 * Names for the SSH hosts and servers a task's workspaces run on, and whether the paired host says
 * each SSH host is connected, read once from the desktop while `client` is set and only when such a
 * host is in play. A local host needs no lookup; nothing here retries or polls.
 */
export function useLocalTaskHostDirectory(
  client: RpcClient | null,
  hostIds: readonly string[]
): LocalTaskHostDirectory {
  const [directory, setDirectory] = useState<LocalTaskHostDirectory>(EMPTY_DIRECTORY)
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
      const labels = new Map<string, string>(
        buildHostLabelById({ sshTargets, hostSettingOverrides: undefined })
      )
      for (const server of servers ?? []) {
        labels.set(server.hostId, server.label)
      }
      const connected = new Map<string, boolean>()
      for (const target of sshTargets) {
        if (typeof target.connected === 'boolean') {
          connected.set(sshTargetSummaryHostId(target.id), target.connected)
        }
      }
      setDirectory({ labels, connected })
    })
    return () => {
      current = false
    }
  }, [client, wantsSsh, wantsServers])
  return directory
}

export function useLocalTaskHostLabels(
  client: RpcClient | null,
  hostIds: readonly string[]
): ReadonlyMap<string, string> {
  return useLocalTaskHostDirectory(client, hostIds).labels
}
