import { useCallback, useRef, useState } from 'react'
import type {
  LocalTaskLinks,
  LocalTaskProgressSnapshot
} from '../../../src/shared/local-tasks/local-task-link-types'
import type { LocalTaskChangeScope } from '../../../src/shared/local-tasks/local-task-types'
import type { LocalTasksApi } from './local-tasks-api'

/** Workspaces and sessions linked to tasks, and the library host's live "Needs you" judgement. */
export type LocalTaskWork = {
  links: LocalTaskLinks
  /** Null until the host answers. */
  progress: LocalTaskProgressSnapshot | null
  /** A failed read here leaves the task list usable; only these views say so. */
  error: string | null
}

type WorkKey = 'links' | 'progress'

type WorkData = {
  hostKey: string | null
  links: LocalTaskLinks | null
  progress: LocalTaskProgressSnapshot | null
  errors: Record<WorkKey, string | null>
}

const NO_ERRORS: Record<WorkKey, string | null> = { links: null, progress: null }
const EMPTY_LINKS: LocalTaskLinks = { workspaces: [], sessions: [] }

function emptyFor(hostKey: string | null): WorkData {
  return { hostKey, links: null, progress: null, errors: NO_ERRORS }
}

const WORK_KEYS: readonly WorkKey[] = ['links', 'progress']
const SCOPE_OF: Record<WorkKey, LocalTaskChangeScope> = {
  links: 'links',
  progress: 'attention'
}

/**
 * The link and attention reads of one library, re-read on the scopes the change feed names. Like the
 * task list, a lost connection keeps the last answer and nothing re-reads on a timer.
 */
export function useLocalTaskWork(
  api: LocalTasksApi | null,
  hostKey: string | null
): LocalTaskWork & {
  reload: (scopes?: readonly LocalTaskChangeScope[]) => void
  retry: () => void
} {
  const [data, setData] = useState<WorkData>(() => emptyFor(hostKey))
  const sequence = useRef<Record<WorkKey, number>>({ links: 0, progress: 0 })
  const apiRef = useRef(api)
  apiRef.current = api

  const reload = useCallback(
    (scopes?: readonly LocalTaskChangeScope[]) => {
      if (!api) {
        return
      }
      const own = (previous: WorkData) =>
        previous.hostKey === hostKey ? previous : emptyFor(hostKey)
      const track = <K extends WorkKey>(
        key: K,
        request: () => Promise<NonNullable<WorkData[K]>>
      ) => {
        if (scopes && !scopes.includes(SCOPE_OF[key])) {
          return
        }
        const turn = ++sequence.current[key]
        request().then(
          (value) => {
            if (turn === sequence.current[key] && apiRef.current === api) {
              setData((previous) => {
                const base = own(previous)
                return { ...base, [key]: value, errors: { ...base.errors, [key]: null } }
              })
            }
          },
          (error: unknown) => {
            if (turn === sequence.current[key] && apiRef.current === api) {
              const message = error instanceof Error ? error.message : String(error)
              setData((previous) => {
                const base = own(previous)
                return { ...base, errors: { ...base.errors, [key]: message } }
              })
            }
          }
        )
      }
      track('links', () => api.links())
      track('progress', () => api.progress())
    },
    [api, hostKey]
  )

  const current = data.hostKey === hostKey ? data : emptyFor(hostKey)
  const failed = WORK_KEYS.filter((key) => current.errors[key])
  return {
    links: current.links ?? EMPTY_LINKS,
    progress: current.progress,
    error: current.errors.links ?? current.errors.progress,
    reload,
    retry: () => {
      if (failed.length > 0) {
        reload(failed.map((key) => SCOPE_OF[key]))
      }
    }
  }
}
