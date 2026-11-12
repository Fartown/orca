import { useMemo } from 'react'
import { buildLocalTaskIndex } from '../../../src/shared/local-tasks/local-task-grouping'
import { localTaskDescendantIds } from '../../../src/shared/local-tasks/local-task-tree'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import { localTaskCardFacts } from './local-task-card-facts'
import type { LocalTaskSite } from './local-task-endpoint'
import type { LocalTaskFilter } from './local-task-filter'
import { localTaskLatestLine } from './local-task-latest-line'
import {
  buildLocalTaskGroups,
  localTaskSegmentCounts,
  localTaskStatusLookup,
  type LocalTaskSegment
} from './local-task-list-projection'
import {
  buildLocalTaskSessionLookup,
  localTaskAttentionRows,
  localTaskIdsNeedingYou,
  localTaskNeedsYou,
  localTaskRowSessionStates,
  localTaskSessionViews
} from './local-task-progress-projection'
import { useLocalTaskCardContext } from './use-local-task-card-context'
import type { LocalTasksLibrary } from './use-local-tasks-library'

/**
 * What the library page derives from the loaded library: segment counts, "Needs you", the status
 * groups, and what each card and line says. Read only from what is loaded, except the host names
 * and the PR states the card context reads once.
 */
export function useLocalTasksLibraryModel(args: {
  site: LocalTaskSite
  library: LocalTasksLibrary
  projectId: string | null
  segment: 'attention' | LocalTaskSegment
  view: 'list' | 'board'
  filter: LocalTaskFilter
}) {
  const { site, library, projectId, segment, view, filter } = args
  const lookup = useMemo(() => localTaskStatusLookup(library.projects), [library.projects])
  const counts = localTaskSegmentCounts(library.tasks, library.projects, projectId)
  const inContact = site.connState === 'connected'
  // Scoped like the desktop view and the other segments (REQ-006); home's global card opens on All.
  const attentionRows = localTaskAttentionRows({
    snapshot: library.work.progress,
    tasks: library.tasks,
    projects: library.projects,
    projectId
  })
  const groups = buildLocalTaskGroups({
    tasks: library.tasks,
    projects: library.projects,
    projectId,
    segment: segment === 'attention' ? 'all' : segment,
    filter,
    // Out of contact nothing is confirmed as waiting, so the filter shows none.
    needingYou: inContact ? localTaskIdsNeedingYou(attentionRows) : undefined,
    nestSubtasks: view === 'list',
    keepEmpty: view === 'board'
  })
  // The All list leads with "Needs you" for the tasks it shows (the desktop's band).
  const listBand =
    segment === 'all' && view === 'list'
      ? localTaskNeedsYou({
          snapshot: library.work.progress,
          tasks: library.tasks,
          projects: library.projects,
          projectId,
          visibleIds: new Set(
            groups.flatMap((group) =>
              group.rows.flatMap((row) => [
                row.task.id,
                ...row.subtasks.map((line) => line.task.id)
              ])
            )
          )
        })
      : null
  const cards = useLocalTaskCardContext({
    site,
    library,
    reviewTasks: [...attentionRows, ...(listBand?.rows ?? [])]
      .filter((row) => row.review)
      .map((row) => row.task)
  })
  // Why once per load: every card reads them, and rebuilding them per card made the board O(N²).
  const index = useMemo(
    () => buildLocalTaskIndex(library.projects, library.tasks),
    [library.projects, library.tasks]
  )
  const sessionLookup = useMemo(
    () => buildLocalTaskSessionLookup(library.work.links, library.work.progress),
    [library.work.links, library.work.progress]
  )
  const tasksById = index.tasksById
  const sessionsFor = (task: LocalTask) =>
    localTaskRowSessionStates({
      task,
      index,
      links: library.work.links,
      snapshot: library.work.progress,
      inContact,
      lookup: sessionLookup
    })
  const factsFor = (task: LocalTask) =>
    localTaskCardFacts({
      task,
      index,
      links: library.work.links,
      snapshot: library.work.progress,
      inContact,
      hostName: cards.context.hostName,
      hostConnected: cards.context.hostConnected,
      lookup: sessionLookup
    })
  const latestLineFor = (task: LocalTask) =>
    localTaskLatestLine(
      task,
      localTaskSessionViews({
        task,
        index,
        links: library.work.links,
        snapshot: library.work.progress,
        inContact,
        lookup: sessionLookup
      }),
      localTaskDescendantIds(task.id, index.childrenByParentId).flatMap((id) => {
        const child = index.tasksById.get(id)
        return child ? [child] : []
      })
    )
  return {
    lookup,
    counts,
    inContact,
    attentionRows,
    groups,
    listBand,
    cards,
    tasksById,
    index,
    sessionsFor,
    factsFor,
    latestLineFor
  }
}
