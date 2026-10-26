import { useEffect, useState } from 'react'
import { normalizeLocalTaskPrefix } from '../../../src/shared/local-tasks/local-task-model'
import type { LocalTaskProject } from '../../../src/shared/local-tasks/local-task-types'
import type { UnvalidatedRpcRequestPort } from '../transport/unvalidated-rpc-request-port'
import {
  projectSectionsRead,
  readServedProjectSections
} from '../worktree/project-sections-operations'

export type OrcaProjectChoice = {
  /** Orca's cross-host Project id, which a task project records as `orcaProjectId`. */
  id: string
  displayName: string
  defaultRepoId: string | null
  /** Each host setup's own name, local and SSH alike. */
  setupNames: string[]
}

export type OrcaProjectChoices =
  | { state: 'loading' }
  | { state: 'unavailable' }
  | { state: 'ready'; projects: OrcaProjectChoice[] }

/**
 * The desktop sidebar's Orca projects, from the catalog the desktop window publishes. Null until
 * a window has published one, which is "unavailable" here rather than "no projects".
 */
export function useOrcaProjectChoices(
  client: UnvalidatedRpcRequestPort | null
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
        const { projects, setups } = read.value
        setChoices({
          state: 'ready',
          projects: projects.map((project) => {
            const own = setups.filter((setup) => setup.projectId === project.id)
            return {
              id: project.id,
              displayName: project.displayName,
              defaultRepoId: own[0]?.repoId ?? null,
              setupNames: own.map((setup) => setup.displayName)
            }
          })
        })
      })
    return () => {
      current = false
    }
  }, [client])
  return choices
}

/** `shop` → `SHOP`; a name with no ASCII letters gets `P`. Never one a project already holds. */
export function suggestLocalTaskPrefix(
  displayName: string,
  projects: readonly LocalTaskProject[]
): string {
  const taken = new Set(projects.flatMap((project) => [project.prefix, ...project.aliases]))
  const letters = displayName.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const base = normalizeLocalTaskPrefix(letters.slice(0, 4)) ?? 'P'
  if (!taken.has(base)) {
    return base
  }
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const candidate = normalizeLocalTaskPrefix(`${base.slice(0, 7)}${suffix}`)
    if (candidate && !taken.has(candidate)) {
      return candidate
    }
  }
  return base
}
