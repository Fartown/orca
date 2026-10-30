import type { HandlerGroup } from '../handler-group-manifest'

export const LOCAL_TASK_HANDLER_GROUP: HandlerGroup = {
  name: 'local-tasks',
  keys: ['task list', 'task show', 'task current', 'task comment', 'task status'],
  load: async () => (await import('./local-task-cli-handlers.js')).LOCAL_TASK_CLI_HANDLERS
}
