import { useEffect, useState } from 'react'
import {
  suggestLocalTaskPrefix as suggestPrefix,
  takenLocalTaskPrefixes
} from '../../../src/shared/local-tasks/local-task-prefix-suggestion'
import type { LocalTaskProject } from '../../../src/shared/local-tasks/local-task-types'
import type { UnvalidatedRpcRequestPort } from '../transport/unvalidated-rpc-request-port'
import {
  projectSectionsRead,
  readServedProjectSections
} from '../worktree/project-sections-operations'
import type { LocalTaskEndpoint } from './local-task-endpoint'
import { localTaskSetupsFor } from './local-task-project-setups'

export type OrcaProjectChoice = {
  /** Orca's cross-host Project id, which a task project lists in `repos`. */
  id: string
  displayName: string
  /** Each of its checkouts' names on the library's host, local and SSH alike. */
  setupNames: string[]
}

export type OrcaProjectChoices =
  | { state: 'loading' }
  | { state: 'unavailable' }
  | { state: 'ready'; projects: OrcaProjectChoice[] }

/**
 * The Orca projects with a checkout on the library's own host (D-008: a task project's repos are on
 * the same host), from the catalog the paired host publishes. "Unavailable" until it has one.
 */
export function useOrcaProjectChoices(
  client: UnvalidatedRpcRequestPort | null,
  endpoint: LocalTaskEndpoint
): OrcaProjectChoices {
  const [choices, setChoices] = useState<OrcaProjectChoices>({ state: 'loading' })
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
        if (read.kind !== 'answered' || !read.value) {
          setChoices({ state: 'unavailable' })
          return
        }
        const setups = localTaskSetupsFor(read.value, endpoint, [])
        setChoices({
          state: 'ready',
          projects: read.value.projects.flatMap((project) => {
            const own = setups.filter((setup) => setup.orcaProjectId === project.id)
            return own.length === 0
              ? []
              : [
                  {
                    id: project.id,
                    displayName: project.displayName,
                    setupNames: own.map((setup) => setup.label)
                  }
                ]
          })
        })
      })
    return () => {
      current = false
    }
  }, [client, endpoint])
  return choices
}

export function suggestLocalTaskPrefix(
  displayName: string,
  projects: readonly LocalTaskProject[]
): string {
  return suggestPrefix(displayName, takenLocalTaskPrefixes(projects))
}
