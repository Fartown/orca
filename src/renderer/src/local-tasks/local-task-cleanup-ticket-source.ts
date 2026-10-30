import { useMemo } from 'react'
import type { WorkspaceCleanupTicketSource } from '../../../shared/workspace-cleanup-filter-model'
import { findLocalTaskLinkForWorkspace } from './local-task-link-selectors'
import { selectLocalTaskSourceVisible } from './local-task-source-visibility'
import { localTasksDomainStore, useLocalTasksDomain } from './local-tasks-domain-store'

const LOCAL_TASK_SOURCE: WorkspaceCleanupTicketSource = 'local-task'

/**
 * "Local task" in workspace cleanup's ticket sources, from the task library's links: the task stays
 * linked to the workspace, so it is never "completely empty". Read when the dialog builds its rows.
 */
export function localTaskCleanupTicketSources(workspace: {
  id: string
  hostId: string
}): WorkspaceCleanupTicketSource[] {
  const { links } = localTasksDomainStore.getState()
  return findLocalTaskLinkForWorkspace(links, workspace) ? [LOCAL_TASK_SOURCE] : []
}

/** The filter offers Local only once a library has a project and Local is not hidden. */
export function useLocalTaskCleanupTicketSourceValues(
  values: readonly WorkspaceCleanupTicketSource[],
  selected: readonly WorkspaceCleanupTicketSource[]
): readonly WorkspaceCleanupTicketSource[] {
  const offered = useLocalTasksDomain(
    (state) => state.projects.length > 0 && selectLocalTaskSourceVisible(state)
  )
  // Why keep a selected value: a filter saved before Local was hidden must stay removable.
  const keep = offered || selected.includes(LOCAL_TASK_SOURCE)
  return useMemo(
    () => (keep ? values : values.filter((value) => value !== LOCAL_TASK_SOURCE)),
    [keep, values]
  )
}
