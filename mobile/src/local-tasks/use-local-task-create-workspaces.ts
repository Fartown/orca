import { useEffect, useState } from 'react'
import type { RpcClient } from '../transport/rpc-client'
import { worktreeCatalogRead } from '../worktree/worktree-catalog-operations'
import { WORKTREE_PS_FULL_LIMIT } from '../worktree/worktree-catalog-snapshot-client'
import { readLocalTaskMainWorkspaceIds } from './local-task-create-choices'
import {
  readLocalTaskWorkspaceCandidates,
  type LocalTaskWorkspaceCandidate
} from './local-task-workspace-candidates'
import {
  readLocalTaskWorkspaceListing,
  type LocalTaskWorkspaceListing
} from './local-task-workspace-row'

export type LocalTaskCreateWorkspacesState =
  | { status: 'loading' }
  | { status: 'failed' }
  | {
      status: 'ready'
      candidates: LocalTaskWorkspaceCandidate[]
      /** The same page read for PR state; null when the host's reply carries none. */
      listing: LocalTaskWorkspaceListing | null
      mainIds: ReadonlySet<string>
    }

/**
 * New task's workspaces: one `worktree.ps` of the library's own host, read when the form opens
 * while that host is in contact (`client` set) and again only when contact comes back. Shared in
 * flight under `key` with the pickers and the host screen; nothing retries or polls.
 */
export function useLocalTaskCreateWorkspaces(
  client: RpcClient | null,
  key: string
): LocalTaskCreateWorkspacesState {
  const [read, setRead] = useState<{
    client: RpcClient
    state: LocalTaskCreateWorkspacesState
  } | null>(null)
  useEffect(() => {
    if (!client) {
      return
    }
    let current = true
    const settle = (state: LocalTaskCreateWorkspacesState) => {
      if (current) {
        setRead({ client, state })
      }
    }
    worktreeCatalogRead
      .requestSingleFlight(client, key, { limit: WORKTREE_PS_FULL_LIMIT })
      .then((reply) => {
        const catalog = worktreeCatalogRead.interpret(reply)
        if (!catalog.accepted) {
          settle({ status: 'failed' })
          return
        }
        const rows = catalog.value.worktrees ?? []
        settle({
          status: 'ready',
          candidates: readLocalTaskWorkspaceCandidates(rows),
          listing: readLocalTaskWorkspaceListing(catalog.value),
          mainIds: readLocalTaskMainWorkspaceIds(rows)
        })
      })
      .catch(() => settle({ status: 'failed' }))
    return () => {
      current = false
    }
  }, [client, key])
  return read?.client === client ? read.state : { status: 'loading' }
}
