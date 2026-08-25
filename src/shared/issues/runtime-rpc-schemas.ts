export * from './mutation-rpc-schemas'
export * from './query-rpc-schemas'

export const ISSUE_METHOD_NAMES = [
  'issues.status',
  'issues.list',
  'issues.get',
  'issues.create',
  'issues.update',
  'issues.archive',
  'issues.reopen',
  'issues.reparent',
  'issues.prepareDelete',
  'issues.delete',
  'issues.markRead',
  'issues.resolveRound',
  'issues.listRounds',
  'conversations.list',
  'conversations.get',
  'conversations.update',
  'conversations.bindIssue',
  'conversations.prepareLaunch',
  'conversations.recordLaunchFailure',
  'conversations.prepareRetry',
  'conversations.prepareResume',
  'conversations.prepareDelete',
  'conversations.delete'
] as const
