import { useMemo } from 'react'
import { ListTodo, SquarePen } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import {
  isExactLocalTaskRef,
  localTaskRefs,
  matchesLocalTaskQuery
} from '@/local-tasks/local-task-grouping'
import { openLocalTaskPage } from '@/local-tasks/local-task-navigation'
import { localTasksDomainStore, useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import {
  localTaskHostLabelFor,
  useLocalTaskEndpointLabels
} from '@/local-tasks/local-task-endpoint-labels'
import type { LocalTask, LocalTaskProject } from '../../../../shared/local-tasks/local-task-types'
import type { CmdJQuickAction } from './quick-actions'
import type { CmdJQuickActionContext } from './quick-action-context'

const SEARCH_RESULT_MAX = 50

// Why: a browser client reads its paired host's library, so only a window with none opens lacks it.
function availability(_ctx: CmdJQuickActionContext) {
  if (localTasksDomainStore.getState().home === null) {
    return { available: false, reason: 'client-action-unsupported' } as const
  }
  return { available: true } as const
}

function guarded(run: () => void) {
  return async (ctx: CmdJQuickActionContext) => {
    if (!availability(ctx).available) {
      return { status: 'unavailable', reason: 'client-action-unsupported' } as const
    }
    run()
    return { status: 'ok' } as const
  }
}

/**
 * Static Cmd+J entries (REQ-007); the shortcut chip comes from the palette itself. Each answers
 * only to its own title's words, so a bare `create` or `find` keeps upstream's results.
 */
export function getLocalTaskQuickActions(): CmdJQuickAction[] {
  return [
    {
      id: 'local-tasks-new',
      kind: 'action',
      title: translate('localTasks.quickActions.newTask', 'New task…'),
      description: translate(
        'localTasks.quickActions.newTaskDescription',
        'Write down a task in the local task list.'
      ),
      icon: SquarePen,
      verbKeywords: [translate('localTasks.quickActions.verbs.newTask', 'new task')],
      isAvailable: availability,
      run: guarded(() => openLocalTaskPage({ create: true }))
    },
    {
      id: 'local-tasks-open',
      kind: 'action',
      title: translate('localTasks.quickActions.openTask', 'Open task…'),
      description: translate(
        'localTasks.quickActions.openTaskDescription',
        'Find a local task by ref or title.'
      ),
      icon: ListTodo,
      verbKeywords: [translate('localTasks.quickActions.verbs.openTask', 'open task')],
      isAvailable: availability,
      run: guarded(() => openLocalTaskPage({ focusSearch: true }))
    }
  ]
}

// Why one shared list: a query matching no task must not hand the palette a new array per keystroke.
const NO_SEARCH_ACTIONS: readonly CmdJQuickAction[] = []

/**
 * One action per task the task page's own search matches, the exact ref first, capped at 50.
 * Keywords cover every ref the task answers to and its title (REQ-002, REQ-007).
 */
export function buildLocalTaskSearchActions(
  projects: readonly LocalTaskProject[],
  tasks: readonly LocalTask[],
  query: string,
  hostLabels?: ReadonlyMap<string, string>
): readonly CmdJQuickAction[] {
  const trimmed = query.trim()
  if (!trimmed) {
    return NO_SEARCH_ACTIONS
  }
  const projectsById = new Map(projects.map((project) => [project.id, project]))
  const matches = tasks.filter((task) =>
    matchesLocalTaskQuery(task, projectsById.get(task.projectId), trimmed)
  )
  if (matches.length === 0) {
    return NO_SEARCH_ACTIONS
  }
  // Why: the task the query names exactly must survive the cap, whatever order the store holds.
  const exactIds = new Set(
    matches
      .filter((task) => isExactLocalTaskRef(task, projectsById.get(task.projectId), trimmed))
      .map((task) => task.id)
  )
  const ranked = [
    ...matches.filter((task) => exactIds.has(task.id)),
    ...matches.filter((task) => !exactIds.has(task.id))
  ]
  return ranked.slice(0, SEARCH_RESULT_MAX).map((task): CmdJQuickAction => {
    const project = projectsById.get(task.projectId)
    const host = localTaskHostLabelFor(hostLabels, task.id)
    return {
      // Why the client id: it carries the library, so the same ref on two hosts stays two rows.
      id: `local-task:${task.id}`,
      kind: 'action',
      title: `${task.ref} ${task.title}`,
      description: translate(
        'localTasks.quickActions.taskDescription',
        'Local task · {{project}}',
        {
          project: host ? `${project?.name ?? ''} · ${host}` : (project?.name ?? '')
        }
      ),
      icon: ListTodo,
      // Why the query itself: the palette re-ranks by its own tokens, which cannot tell that a
      // zero-padded `shop-01` names SHOP-1.
      verbKeywords: [
        ...localTaskRefs(task, project),
        task.title,
        ...(exactIds.has(task.id) ? [trimmed] : [])
      ],
      sourceQuery: trimmed,
      isAvailable: availability,
      run: guarded(() => openLocalTaskPage({ taskId: task.id }))
    }
  })
}

export function useLocalTaskSearchActions(query: string): readonly CmdJQuickAction[] {
  const projects = useLocalTasksDomain((state) => state.projects)
  const tasks = useLocalTasksDomain((state) => state.tasks)
  const hostLabels = useLocalTaskEndpointLabels()
  return useMemo(
    () => buildLocalTaskSearchActions(projects, tasks, query, hostLabels),
    [projects, tasks, query, hostLabels]
  )
}
