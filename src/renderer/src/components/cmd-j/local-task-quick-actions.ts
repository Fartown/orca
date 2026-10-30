import { ListTodo, SquarePen } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { openLocalTaskPage } from '@/local-tasks/local-task-navigation'
import { selectLocalTaskSourceVisible } from '@/local-tasks/local-task-source-visibility'
import { localTasksDomainStore } from '@/local-tasks/local-tasks-domain-store'
import type { CmdJQuickAction } from './quick-actions'
import type { CmdJQuickActionContext } from './quick-action-context'

// Why: a browser client reads its paired host's library, so only a window with none opens lacks
// it; a source hidden in Settings → Task sources is out of Cmd+J as upstream's hidden providers are.
function availability(_ctx: CmdJQuickActionContext) {
  const state = localTasksDomainStore.getState()
  if (state.home === null || !selectLocalTaskSourceVisible(state)) {
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
 * only to its own title's words, so a bare `create` or `find` keeps upstream's results. Tasks
 * themselves are rows of the Tasks group (local-task-palette-items.ts).
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
