import { useEffect, useState } from 'react'
import type { UnvalidatedRpcRequestPort } from '../transport/unvalidated-rpc-request-port'
import {
  projectSectionsRead,
  readServedProjectSections,
  type ServedProjectSections
} from '../worktree/project-sections-operations'

export type LocalTaskProjectCatalog =
  | { state: 'loading' }
  /** No desktop window has published the sidebar's projects. */
  | { state: 'unavailable' }
  | { state: 'ready'; catalog: ServedProjectSections }

/** The desktop sidebar's projects and their per-host checkouts, read once while `client` is set. */
export function useLocalTaskProjectCatalog(
  client: UnvalidatedRpcRequestPort | null
): LocalTaskProjectCatalog {
  const [catalog, setCatalog] = useState<LocalTaskProjectCatalog>({ state: 'loading' })
  useEffect(() => {
    if (!client) {
      return
    }
    let current = true
    void projectSectionsRead
      .request(client)
      .catch(() => null)
      .then((reply) => {
        if (!current) {
          return
        }
        const read = readServedProjectSections(reply)
        setCatalog(
          read.kind === 'answered' && read.value
            ? { state: 'ready', catalog: read.value }
            : { state: 'unavailable' }
        )
      })
    return () => {
      current = false
    }
  }, [client])
  return catalog
}
