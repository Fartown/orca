import { useCallback, useEffect, useMemo, useRef } from 'react'
import { ListTodo } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { SmartWorkspaceNameModeOption } from '@/components/new-workspace/smart-workspace-localized-options'
import type { SmartNameMode } from '../../../shared/new-workspace/smart-workspace-source-results'
import type { LocalTaskLinks } from '../../../shared/local-tasks/local-task-link-types'
import type { LocalTask, LocalTaskProject } from '../../../shared/local-tasks/local-task-types'
import { localTaskEndpointForHost } from './local-task-endpoints'
import {
  buildLocalTaskSourceRows,
  isLocalTaskSourceRow,
  localTaskSourceBlockedReason,
  type LocalTaskSourceRow
} from './local-task-source-rows'
import { useLocalTaskSourceTab } from './local-task-source-tab'
import { selectLocalTasksPartition, useLocalTasksDomain } from './local-tasks-domain-store'

/** Local tasks sits right after Smart, as Local leads the task page's sources (REQ-008). */
export function withLocalTaskSourceMode(
  modes: SmartWorkspaceNameModeOption[],
  offered: boolean
): SmartWorkspaceNameModeOption[] {
  if (!offered) {
    return modes
  }
  const at = modes.findIndex((mode) => mode.id === 'smart') + 1
  const local: SmartWorkspaceNameModeOption = {
    id: 'local',
    label: translate('localTasks.sourceTab.label', 'Local'),
    Icon: ListTodo
  }
  return [...modes.slice(0, at), local, ...modes.slice(at)]
}

export type LocalTaskSourceSearch = {
  rows: readonly LocalTaskSourceRow[]
  /**
   * The tab is open: it lists tasks before anything is typed, as the task picker it replaced did,
   * and what is typed searches tasks, never parsed as a pasted reference.
   */
  active: boolean
  /** Takes a Local tasks row; false for any other row or one that cannot be picked. */
  select: (row: { kind: string }) => boolean
  isSelected: (row: { kind: string }) => boolean
}

const NO_ROWS: LocalTaskSourceRow[] = []
const NO_PROJECTS: LocalTaskProject[] = []
const NO_TASKS: LocalTask[] = []
const NO_LINKS: LocalTaskLinks = { workspaces: [], sessions: [] }

/** Rows of the Local tasks tab for one work-item search, read only while that tab is open. */
export function useLocalTaskSourceSearch(source: {
  mode: SmartNameMode
  value: string
  availableModes: readonly { id: SmartNameMode }[]
  setMode: (mode: SmartNameMode) => void
}): LocalTaskSourceSearch {
  const tab = useLocalTaskSourceTab()
  const active = tab !== null && source.mode === 'local'
  const projects = useLocalTasksDomain((state) => (active ? state.projects : NO_PROJECTS))
  const tasks = useLocalTasksDomain((state) => (active ? state.tasks : NO_TASKS))
  const links = useLocalTasksDomain((state) => (active ? state.links : NO_LINKS))
  const partition = useLocalTasksDomain((state) =>
    active ? selectLocalTasksPartition(state, localTaskEndpointForHost(tab.hostId)) : undefined
  )
  const blocked = active ? localTaskSourceBlockedReason(partition, tab.libraryLabel) : null
  const query = source.value
  const rows = useMemo(
    () =>
      tab && active
        ? buildLocalTaskSourceRows({ scope: tab, projects, tasks, links, query, blocked })
        : NO_ROWS,
    [active, blocked, links, projects, query, tab, tasks]
  )
  const offered = source.availableModes.some((mode) => mode.id === 'local')
  const opensOnTab = tab?.initialMode === true
  const { setMode } = source
  const openedOnTab = useRef(false)
  useEffect(() => {
    // Why once: after opening there, switching tabs is the user's own choice.
    if (opensOnTab && offered && !openedOnTab.current) {
      openedOnTab.current = true
      setMode('local')
    }
  }, [offered, opensOnTab, setMode])
  const select = useCallback(
    (row: { kind: string }): boolean => {
      if (!tab || !isLocalTaskSourceRow(row) || !row.task || row.disabled) {
        return false
      }
      tab.select(row.task)
      return true
    },
    [tab]
  )
  const selectedTaskId = tab?.selectedTaskId ?? null
  const isSelected = useCallback(
    (row: { kind: string }): boolean =>
      isLocalTaskSourceRow(row) && row.task !== null && row.task.id === selectedTaskId,
    [selectedTaskId]
  )
  return useMemo(() => ({ rows, active, select, isSelected }), [active, isSelected, rows, select])
}
