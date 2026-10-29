import { MOBILE_RPC_METHOD_ALLOWLIST } from './runtime-rpc-mobile-method-allowlist'

/**
 * Mobile-callable methods that fork features add. Kept out of the upstream list, which sits at the
 * max-lines ceiling and would conflict on every upstream sync; `mobile-rpc-allowlist.test.ts`
 * reads both.
 */
export const FORK_MOBILE_RPC_METHOD_ALLOWLIST = new Set([
  'fileAttachment.abortUpload',
  'fileAttachment.appendUploadChunk',
  'fileAttachment.commitUpload',
  'fileAttachment.startUpload',
  'localTasks.attention.acknowledge',
  'localTasks.attention.get',
  'localTasks.attention.snooze',
  'localTasks.events.addComment',
  'localTasks.events.editComment',
  'localTasks.events.list',
  'localTasks.events.removeComment',
  'localTasks.links.linkWorkspace',
  'localTasks.links.list',
  'localTasks.links.recordSession',
  'localTasks.links.unlinkSession',
  'localTasks.links.unlinkWorkspace',
  'localTasks.projects.create',
  'localTasks.projects.list',
  'localTasks.projects.remove',
  'localTasks.projects.update',
  'localTasks.statuses.remove',
  'localTasks.statuses.reorder',
  'localTasks.statuses.upsert',
  'localTasks.status',
  'localTasks.subscribeChanges',
  'localTasks.tasks.batchUpdate',
  'localTasks.tasks.create',
  'localTasks.tasks.createSubtasks',
  'localTasks.tasks.list',
  'localTasks.tasks.move',
  'localTasks.tasks.remove',
  'localTasks.tasks.update',
  'localTasks.unsubscribeChanges'
])

export function isMobileRpcMethodAllowed(method: string): boolean {
  return MOBILE_RPC_METHOD_ALLOWLIST.has(method) || FORK_MOBILE_RPC_METHOD_ALLOWLIST.has(method)
}

/**
 * Fork methods a phone may aim at a server through its desktop with `executionHost: runtime:{env}`,
 * like upstream's `execution-host` routes: each Orca keeps its own task library (D-008).
 */
export function isForkExecutionHostRelayMethod(method: string): boolean {
  return method.startsWith('localTasks.') && FORK_MOBILE_RPC_METHOD_ALLOWLIST.has(method)
}
