import type {
  LocalTaskAttentionKind,
  LocalTaskSessionState
} from '../../../src/shared/local-tasks/local-task-link-types'
import type { LocalTaskSnoozePreset } from '../../../src/shared/local-tasks/local-task-snooze-presets'
import type { LocalTaskReplyStatus } from './use-local-task-attention-actions'

/** Workspaces, sessions, "Needs you", replies and the two automatic rules. */
export const LOCAL_TASKS_WORK_COPY_EN = {
  segmentAttention: 'Needs you',
  homeNeedsYou: (count: number): string => `Needs you ${count}`,
  attentionUnverifiable: (host: string): string =>
    host
      ? `Can't reach ${host}, so what needs you can't be confirmed.`
      : "Can't reach this host, so what needs you can't be confirmed.",
  attentionEmpty: 'Nothing needs you right now.',
  attentionLoading: 'Reading what needs you…',
  workLoadFailed: 'Workspaces and sessions could not be read.',
  attentionKinds: {
    approval: 'Waiting for your approval',
    question: 'Waiting for your answer',
    blocked: 'Blocked',
    'unread-done': 'Finished a turn you have not seen'
  } satisfies Record<LocalTaskAttentionKind, string>,
  agentSaid: (agent: string, message: string): string => `${agent}: “${message}”`,
  agentStopped: (agent: string): string => `${agent} stopped`,
  someAgent: 'The agent',
  moreItems: (count: number): string => `+${count} more`,
  reply: 'Reply',
  replyTitle: (ref: string): string => `Reply in ${ref}`,
  replyPlaceholder: 'Next instruction for the agent',
  replyReconnecting: 'Reconnecting…',
  replySessionMissing: "This session's terminal is no longer listed. Open the session instead.",
  openSession: 'Open session',
  markSeen: 'Mark seen',
  snooze: 'Snooze',
  snoozeTitle: 'Bring it back',
  snoozeChoices: {
    hour: 'In 1 hour',
    tonight: 'Tonight',
    tomorrow: 'Tomorrow morning',
    'next-week': 'Next week'
  } satisfies Record<LocalTaskSnoozePreset, string>,
  itemActions: 'Item actions',
  replyStates: {
    sending: 'Sending…',
    delivered: 'Delivered',
    unconfirmed: 'Sent, but not confirmed. Check the session before sending again.'
  } satisfies Record<Exclude<LocalTaskReplyStatus['kind'], 'not-sent'>, string>,
  replyNotSent: 'Not sent. Your reply is back in the box.',
  replyNotSentBecause: (reason: string): string =>
    `Not sent: ${reason}. Your reply is back in the box.`,
  editReply: 'Edit and send again',
  workspaceSection: 'Workspace',
  sessionsSection: 'Sessions',
  noWorkspace: 'No workspace yet.',
  inheritedWorkspace: (ref: string): string => `Works in ${ref}'s workspace`,
  folderProjectHint:
    'This project is a folder, so a workspace is not created; link an existing one.',
  noSetupHint: "None of this project's repos is on this host.",
  noRepoOnHostHint: 'This host has no repo to start in yet.',
  start: 'Start',
  startOwn: 'Start its own',
  startTitle: (ref: string): string => `Start ${ref}`,
  startWhere: (name: string, host: string): string => `New workspace ${name} on ${host}`,
  changeLocation: 'Change repo or host',
  pickLocation: 'Repo and host',
  openSessionAction: 'Open a session',
  openSessionTitle: (ref: string): string => `New session for ${ref}`,
  sendNow: 'Send the prompt now',
  sendAsDraft: 'Only put the prompt in the input',
  deliveryHintSubmit: 'Tap to leave it as a draft instead',
  deliveryHintDraft: 'Tap to send it as the first message',
  noAgents: 'No enabled agent was found on this host.',
  loadingAgents: 'Finding agents…',
  workspaceOnly: 'Just create the workspace',
  workspaceOnlyHint: 'No agent starts; open a session later',
  linkExisting: 'Link an existing workspace',
  linkExistingTitle: (ref: string): string => `Link a workspace to ${ref}`,
  noWorkspacesToLink: 'This host lists no workspace of this project.',
  workspaceTaken: (ref: string): string => `Belongs to ${ref}`,
  unlinkWorkspace: 'Unlink workspace',
  unlinkWorkspaceTitle: 'Unlink this workspace?',
  unlinkWorkspaceMessage:
    'Only the link is removed, together with the sessions linked through it. The workspace and its sessions keep running.',
  openWorkspace: 'Open workspace',
  hostLocal: 'This computer',
  hostOffline: (host: string): string => `${host} is not connected`,
  hostUnknown: "Can't confirm the host's connection",
  checkConnection: 'Check connection',
  ofSubtask: (ref: string): string => `For ${ref}`,
  sessionStates: {
    working: 'Working',
    waiting: 'Waiting for you',
    blocked: 'Blocked',
    done: 'Finished a turn',
    idle: 'Idle',
    exited: 'Ended',
    missing: "Can't find this session",
    unknown: 'Status unknown',
    unverifiable: "Can't confirm"
  } satisfies Record<LocalTaskSessionState, string>,
  starting: 'Starting…',
  startedNotLinked:
    'The workspace was created but not linked to the task. Use “Link an existing workspace” to link it.',
  sessionNotRecorded:
    'The agent started, but the session was not recorded on the task. It is in the workspace.',
  launchUnconfirmed: "Couldn't confirm the agent started. Check the workspace before trying again.",
  workspaceUnconfirmed:
    "Couldn't confirm the workspace was created. Check the workspace list before trying again.",
  updateDesktop: "Update this host's Orca to start agents from your phone.",
  linkToTask: 'Link to task…',
  linkToTaskTitle: 'Link this workspace to',
  linkSessionToTask: 'Link this session…',
  linkSessionTitle: 'This session works on',
  noOpenTasks: 'No open tasks on this host.',
  hasWorkspace: (name: string): string => `Already has ${name}`,
  rulesSection: 'Automatic rules',
  ruleStart: 'Start moves the task to In progress',
  ruleStartHint: 'When a workspace or the first session is linked from the task.',
  rulePrMerged: 'A merged PR completes the task',
  rulePrMergedHint: 'Checked on the desktop while its window is open.'
}

export type LocalTasksWorkCopy = typeof LOCAL_TASKS_WORK_COPY_EN
