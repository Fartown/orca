import { createContext, useContext, useSyncExternalStore } from 'react'
import { toLocalTaskOwnedHostId } from '../../../src/shared/local-tasks/local-task-endpoint-ids'
import type {
  LocalTaskLinks,
  LocalTaskWorkspaceLink
} from '../../../src/shared/local-tasks/local-task-link-types'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import { worktreeIdsEqual } from '../../../src/shared/worktree/id'
import type { Worktree } from '../worktree/workspace-list-types'
import {
  localTaskEndpointFor,
  localTaskListedHostId,
  type LocalTaskEndpoint
} from './local-task-endpoint'
import {
  readLocalTaskWorkspaceCandidates,
  type LocalTaskWorkspaceCandidate
} from './local-task-workspace-candidates'
import { localTasksRouteHref } from './local-tasks-route'

/**
 * One library as the host list last read it; `live` while it is followed in contact. `glyphShown`
 * follows the desktop's Display properties → Local task, as upstream's row glyphs follow theirs.
 */
export type LocalTaskHostLibrary = {
  links: LocalTaskLinks
  tasks: readonly LocalTask[]
  live: boolean
  glyphShown: boolean
}

/** The host list's libraries by endpoint key (`self`, or a server's `runtime:E`). */
export function createLocalTaskHostLibraries() {
  const libraries = new Map<string, LocalTaskHostLibrary>()
  const listeners = new Set<() => void>()
  return {
    get: (key: string): LocalTaskHostLibrary | null => libraries.get(key) ?? null,
    set: (key: string, library: LocalTaskHostLibrary | null): void => {
      if ((libraries.get(key) ?? null) === library) {
        return
      }
      if (library) {
        libraries.set(key, library)
      } else {
        libraries.delete(key)
      }
      for (const listener of listeners) {
        listener()
      }
    },
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}

export type LocalTaskHostLibraries = ReturnType<typeof createLocalTaskHostLibraries>

export type LocalTaskHostRows = {
  /** The paired host, which every route the rows open is under. */
  hostId: string
  libraries: LocalTaskHostLibraries
  /** Closes the long-press sheet and opens `href` the way the host list opens its routes. */
  open: (href: string) => void
}

export const LocalTaskHostRowsContext = createContext<LocalTaskHostRows | null>(null)

function sameListedHost(listed: string, rowHost: string): boolean {
  const owned = toLocalTaskOwnedHostId(rowHost)
  return listed === rowHost || (owned !== null && owned === toLocalTaskOwnedHostId(listed))
}

/**
 * The link holding a listed row in the library that owns it, matched as `localTaskLinkHolding`
 * matches, on the phone's host ids: a server's library holds only that server's `runtime:E` rows.
 */
export function localTaskLinkForListedRow(
  endpoint: LocalTaskEndpoint,
  links: LocalTaskLinks,
  row: Pick<
    LocalTaskWorkspaceCandidate,
    'worktreeId' | 'hostId' | 'instanceId' | 'folderWorkspaceId'
  >
): LocalTaskWorkspaceLink | null {
  return (
    links.workspaces.find((link) => {
      if (row.folderWorkspaceId) {
        return link.kind === 'folder' && link.folderWorkspaceId === row.folderWorkspaceId
      }
      const listed = localTaskListedHostId(endpoint, link.hostId)
      if (link.kind === 'folder' || listed === null || !sameListedHost(listed, row.hostId)) {
        return false
      }
      if (row.instanceId && link.instanceId) {
        return link.instanceId === row.instanceId
      }
      return link.worktreeId !== null && worktreeIdsEqual(link.worktreeId, row.worktreeId)
    }) ?? null
  )
}

export type LocalTaskForHostRow = {
  task: LocalTask
  live: boolean
  glyphShown: boolean
  open: () => void
}

const noSubscription = () => () => {}

/** The local task a host-list row belongs to, read from its owning library; null off the host list. */
export function useLocalTaskForHostRow(row: Worktree | null): LocalTaskForHostRow | null {
  const rows = useContext(LocalTaskHostRowsContext)
  const endpoint = row ? localTaskEndpointFor(row.hostId) : null
  const library = useSyncExternalStore(
    rows ? rows.libraries.subscribe : noSubscription,
    () => (endpoint && rows?.libraries.get(endpoint.key)) ?? null
  )
  if (!rows || !library || !row || !endpoint) {
    return null
  }
  const candidate = readLocalTaskWorkspaceCandidates([row])[0]
  const link = candidate ? localTaskLinkForListedRow(endpoint, library.links, candidate) : null
  const task = link ? library.tasks.find((entry) => entry.id === link.taskId) : undefined
  if (!task) {
    return null
  }
  const href = localTasksRouteHref(
    rows.hostId,
    { taskId: task.id },
    { executionHost: endpoint.executionHost }
  )
  return { task, live: library.live, glyphShown: library.glyphShown, open: () => rows.open(href) }
}
