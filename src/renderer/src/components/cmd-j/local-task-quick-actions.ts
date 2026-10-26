import { useMemo } from 'react'
import { ListTodo, SquarePen } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import {
  isExactLocalTaskRef,
  localTaskRefs,
  matchesLocalTaskQuery
} from '@/local-tasks/local-task-grouping'
import { openLocalTaskPage } from '@/local-tasks/local-task-navigation'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import type { CmdJQuickAction } from './quick-actions'
import type { CmdJQuickActionContext } from './quick-action-context'

const SEARCH_RESULT_MAX = 50

// Why: the task library belongs to this desktop; a paired web client cannot reach it.
function availability(ctx: CmdJQuickActionContext) {
  if (ctx.runtimeMode !== 'local-desktop') {
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

/** Static Cmd+J entries (REQ-007); the shortcut chip comes from the palette itself. */
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
      verbKeywords: [
        translate('localTasks.quickActions.verbs.newTask', 'new task'),
        translate('localTasks.quickActions.verbs.createTask', 'create task')
      ],
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
      verbKeywords: [
        translate('localTasks.quickActions.verbs.openTask', 'open task'),
        translate('localTasks.quickActions.verbs.findTask', 'find task')
      ],
      isAvailable: availability,
      run: guarded(() => openLocalTaskPage({ focusSearch: true }))
    }
  ]
}

/**
 * One action per matching task while the palette has a query, capped at 50. Keywords cover the
 * current ref, the same number under earlier prefixes, and the title (REQ-002, REQ-007).
 */
export function useLocalTaskSearchActions(query: string): CmdJQuickAction[] {
  const projects = useLocalTasksDomain((state) => state.projects)
  const tasks = useLocalTasksDomain((state) => state.tasks)
  return useMemo(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      return []
    }
    const projectsById = new Map(projects.map((project) => [project.id, project]))
    const matches = tasks.filter((task) =>
      matchesLocalTaskQuery(task, projectsById.get(task.projectId), trimmed)
    )
    // Why: the task the query names exactly must survive the cap, whatever order the store holds.
    const exact = matches.filter((task) =>
      isExactLocalTaskRef(task, projectsById.get(task.projectId), trimmed)
    )
    const ranked = [...exact, ...matches.filter((task) => !exact.includes(task))]
    return ranked.slice(0, SEARCH_RESULT_MAX).map((task): CmdJQuickAction => {
      const project = projectsById.get(task.projectId)
      return {
        id: `local-task:${task.id}`,
        kind: 'action',
        title: `${task.ref} ${task.title}`,
        description: translate(
          'localTasks.quickActions.taskDescription',
          'Local task · {{project}}',
          {
            project: project?.name ?? ''
          }
        ),
        icon: ListTodo,
        verbKeywords: [...localTaskRefs(task, project), task.title],
        sourceQuery: trimmed,
        isAvailable: availability,
        run: guarded(() => openLocalTaskPage({ taskId: task.id }))
      }
    })
  }, [projects, tasks, query])
}
