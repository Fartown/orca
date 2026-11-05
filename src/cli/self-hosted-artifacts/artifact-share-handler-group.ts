import type { HandlerGroup } from '../handler-group-manifest'

// Why: this fork shares files over the local network from the computer that holds them.
export const ARTIFACT_SHARE_HANDLER_GROUP: HandlerGroup = {
  name: 'artifacts',
  keys: [
    'artifacts list',
    'artifacts share',
    'artifacts update',
    'artifacts unshare',
    'artifacts delete',
    'artifacts service status',
    'artifacts comments list',
    'artifacts comments delete'
  ],
  load: async () => (await import('./artifact-share-cli-handlers.js')).ARTIFACT_SHARE_CLI_HANDLERS
}
