import type { HandlerGroup } from '../handler-group-manifest'

export const LOCAL_TASK_HANDLER_GROUP: HandlerGroup = {
  name: 'local-tasks',
  keys: [
    'task list',
    'task show',
    'task current',
    'task create',
    'task update',
    'task comment',
    'task status',
    'task progress',
    'task guide',
    'task propose',
    'task inbox',
    'task watch',
    'task unwatch',
    'task needs-you'
  ],
  load: async () => (await import('./local-task-cli-handlers.js')).LOCAL_TASK_CLI_HANDLERS
}
