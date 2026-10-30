import { createContext, useContext } from 'react'
import type { LocalTask } from '../../../shared/local-tasks/local-task-types'
import { localTaskEndpointForHost } from './local-task-endpoints'
import type { LocalTaskSourceScope } from './local-task-source-rows'
import { selectLocalTaskSourceVisible } from './local-task-source-visibility'
import {
  selectLocalTasksPartition,
  useLocalTasksDomain,
  type LocalTasksDomainState
} from './local-tasks-domain-store'

/**
 * What a surface hosting Orca's work-item search tells its Local tasks tab: where to look, the task
 * it holds now, and how to take another. Workspace details holds a draft link; the composer a pick.
 */
export type LocalTaskSourceTab = LocalTaskSourceScope & {
  /** The library's Orca, named for "X is not connected". */
  libraryLabel: string
  selectedTaskId: string | null
  /** Open on this tab, as 关联到任务… and Start ask. */
  initialMode: boolean
  select: (task: LocalTask) => void
  /** The composer's name the pick wrote into the shared search box: not a query of the user's. */
  pickedName?: string
  /** Workspace details only: the saved link, dropping the task from the draft, and Save's write. */
  draft?: {
    linkedTaskId: string | null
    remove: () => void
    /** Writes the draft once the rest of the details saved; the failure to show, or null. */
    commit: () => Promise<string | null>
  }
}

export const LocalTaskSourceTabContext = createContext<LocalTaskSourceTab | null>(null)

export function useLocalTaskSourceTab(): LocalTaskSourceTab | null {
  return useContext(LocalTaskSourceTabContext)
}

/**
 * The tab shows only for a library this client has read that holds a project, while Local is not
 * hidden in Settings → Task sources. Out of contact it still shows, greyed, from what was read.
 */
export function isLocalTaskSourceTabOffered(state: LocalTasksDomainState, hostId: string): boolean {
  const partition = selectLocalTasksPartition(state, localTaskEndpointForHost(hostId))
  return (partition?.projects.length ?? 0) > 0 && selectLocalTaskSourceVisible(state)
}

export function useLocalTaskSourceTabOffered(): boolean {
  const tab = useLocalTaskSourceTab()
  return useLocalTasksDomain(
    (state) => tab !== null && isLocalTaskSourceTabOffered(state, tab.hostId)
  )
}
