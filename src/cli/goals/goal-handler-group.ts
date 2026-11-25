import type { HandlerGroup } from '../dispatch/handler-group-manifest'

export const GOAL_HANDLER_GROUP: HandlerGroup = {
  name: 'goals',
  keys: ['goal draft', 'goal checklist', 'goal start', 'goal status', 'goal stop'],
  load: async () => (await import('./goal-cli-handlers.js')).GOAL_CLI_HANDLERS
}
