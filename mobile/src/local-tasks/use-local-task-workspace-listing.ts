import { useEffect, useState } from 'react'
import type { RpcClient } from '../transport/rpc-client'
import { worktreeCatalogRead } from '../worktree/worktree-catalog-operations'
import { WORKTREE_PS_FULL_LIMIT } from '../worktree/worktree-catalog-snapshot-client'
import {
  readLocalTaskWorkspaceListing,
  type LocalTaskWorkspaceListing
} from './local-task-workspace-row'

export type LocalTaskWorkspaceListingState =
  | { status: 'loading' }
  /** The read failed or the host answered something this build cannot read. */
  | { status: 'unread' }
  | { status: 'ready'; listing: LocalTaskWorkspaceListing }

/**
 * The library host's workspace list, read when the task's card shows a linked workspace (`subject`
 * names it) and the host is in contact (`open`). A new link, or contact coming back, is what reads
 * again; nothing retries or polls. Shared in flight under `key` with the link pickers and the host
 * screen.
 */
export function useLocalTaskWorkspaceListing(args: {
  client: RpcClient | null
  key: string
  subject: string | null
  open: boolean
}): LocalTaskWorkspaceListingState {
  const { client, key, subject, open } = args
  const [read, setRead] = useState<{
    client: RpcClient
    subject: string
    state: LocalTaskWorkspaceListingState
  } | null>(null)
  useEffect(() => {
    if (!open || !client || subject === null) {
      return
    }
    let current = true
    const settle = (state: LocalTaskWorkspaceListingState) => {
      if (current) {
        setRead({ client, subject, state })
      }
    }
    worktreeCatalogRead
      .requestSingleFlight(client, key, { limit: WORKTREE_PS_FULL_LIMIT })
      .then((reply) => {
        const catalog = worktreeCatalogRead.interpret(reply)
        const listing = catalog.accepted ? readLocalTaskWorkspaceListing(catalog.value) : null
        settle(listing ? { status: 'ready', listing } : { status: 'unread' })
      })
      .catch(() => settle({ status: 'unread' }))
    return () => {
      current = false
    }
  }, [client, key, subject, open])
  return open && read?.client === client && read.subject === subject
    ? read.state
    : { status: 'loading' }
}
