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

type SshStateNotice = { type: 'sshStateChanged'; targetId: string; state: { status: unknown } }

function isSshStateNotice(payload: unknown): payload is SshStateNotice {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'type' in payload &&
    payload.type === 'sshStateChanged' &&
    'targetId' in payload &&
    typeof payload.targetId === 'string' &&
    'state' in payload &&
    typeof payload.state === 'object' &&
    payload.state !== null &&
    'status' in payload.state
  )
}

/**
 * Names for the SSH hosts and servers a task's workspaces run on, and whether the paired host says
 * each SSH host is connected, read from the desktop while `client` is set and only when such a host
 * is in play. With `followConnections`, the desktop's SSH notices keep that word current, and one
 * read when its notice stream comes back makes up for notices missed out of contact. A local host
 * needs no lookup; nothing here retries or polls.
 */
export function useLocalTaskHostDirectory(
  client: RpcClient | null,
  hostIds: readonly string[],
  followConnections = true
): LocalTaskHostDirectory {
  const [directory, setDirectory] = useState<LocalTaskHostDirectory>(EMPTY_DIRECTORY)
  const kinds = new Set(hostIds.map((hostId) => parseExecutionHostId(hostId)?.kind))
  const wantsSsh = kinds.has('ssh')
  const wantsServers = kinds.has('runtime')
  const follow = followConnections && wantsSsh
  useEffect(() => {
    if (!client || (!wantsSsh && !wantsServers)) {
      return
    }
    let current = true
    let reads = 0
    // Notices since the latest read was sent: its answer may predate them.
    let noticed = new Map<string, boolean>()
    const read = () => {
      const turn = ++reads
      noticed = new Map()
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
        if (!current || turn !== reads) {
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
        setDirectory({ labels, connected: new Map([...connected, ...noticed]) })
      })
    }
    read()
    if (!follow) {
      return () => {
        current = false
      }
    }
    // The client replays the stream on reconnect; a later `ready` is contact coming back.
    let readyBefore = false
    const stopNotices = client.subscribe(
      'runtime.clientEvents.subscribe',
      null,
      (payload: unknown) => {
        if (!current || !payload || typeof payload !== 'object' || !('type' in payload)) {
          return
        }
        if (payload.type === 'ready') {
          if (readyBefore) {
            read()
          }
          readyBefore = true
        } else if (isSshStateNotice(payload)) {
          const hostId = sshTargetSummaryHostId(payload.targetId)
          const connected = payload.state.status === 'connected'
          noticed.set(hostId, connected)
          setDirectory((previous) =>
            previous.connected.get(hostId) === connected
              ? previous
              : { ...previous, connected: new Map(previous.connected).set(hostId, connected) }
          )
        }
      }
    )
    return () => {
      current = false
      stopNotices()
    }
  }, [client, wantsSsh, wantsServers, follow])
  return directory
}

export function useLocalTaskHostLabels(
  client: RpcClient | null,
  hostIds: readonly string[]
): ReadonlyMap<string, string> {
  return useLocalTaskHostDirectory(client, hostIds, false).labels
}
