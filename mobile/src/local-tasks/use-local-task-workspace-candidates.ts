import { useEffect, useState } from 'react'
import type { RpcClient } from '../transport/rpc-client'
import { worktreeCatalogRead } from '../worktree/worktree-catalog-operations'
import { WORKTREE_PS_FULL_LIMIT } from '../worktree/worktree-catalog-snapshot-client'
import {
  readLocalTaskWorkspaceCandidates,
  type LocalTaskWorkspaceCandidate
} from './local-task-workspace-candidates'

export type LocalTaskCandidatesState =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; candidates: LocalTaskWorkspaceCandidate[] }

/**
 * The workspaces a picker offers, read each time it opens from the library's own host (D-008): its
 * `worktree.ps` names hosts as that Orca does (`local`, its SSH targets), which is what its links
 * record. Shared in flight with the host screen under `key`; nothing here retries or polls.
 */
export function useLocalTaskWorkspaceCandidates(args: {
  client: RpcClient | null
  key: string
  open: boolean
}): LocalTaskCandidatesState {
  const { client, key, open } = args
  const [state, setState] = useState<LocalTaskCandidatesState>({ status: 'loading' })
  useEffect(() => {
    if (!open || !client) {
      return
    }
    let current = true
    setState({ status: 'loading' })
    worktreeCatalogRead
      .requestSingleFlight(client, key, { limit: WORKTREE_PS_FULL_LIMIT })
      .then((reply) => {
        if (!current) {
          return
        }
        const catalog = worktreeCatalogRead.interpret(reply)
        setState(
          catalog.accepted
            ? {
                status: 'ready',
                candidates: readLocalTaskWorkspaceCandidates(catalog.value.worktrees ?? [])
              }
            : { status: 'failed' }
        )
      })
      .catch(() => current && setState({ status: 'failed' }))
    return () => {
      current = false
    }
  }, [client, key, open])
  return state
}
