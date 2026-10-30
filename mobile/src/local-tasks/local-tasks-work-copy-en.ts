import type { CheckStatus } from '../../../src/shared/github/pull-request-types'
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
      ? `${host} is not connected, so what needs you can’t be confirmed.`
      : 'This host’s Orca is not connected, so what needs you can’t be confirmed.',
  // The library is in contact, but some of its sessions run on a host it cannot reach.
  attentionUnverifiableHosts:
    'Nothing is waiting on you on the hosts in contact. Sessions on hosts that are not connected can’t be confirmed until they are back.',
  attentionEmpty: 'No session on a task is waiting on you.',
  attentionLoading: 'Reading session status…',
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
  reply: 'Reply',
  replyTitle: (title: string): string => `Reply in “${title}”`,
  replyPlaceholder: 'Next instruction for the agent…',
  replyReconnecting: 'Reconnecting…',
  replyDisconnected: (host: string): string =>
    host
      ? `${host} is not connected, so the reply can’t be sent now. Your text stays here.`
      : 'This host’s Orca is not connected, so the reply can’t be sent now. Your text stays here.',
  // Each reason below finishes "Not sent: …", so it is a clause, not a sentence.
  replySessionMissing: 'this session’s terminal is no longer listed; open the session instead',
  replyNoSession: 'this session is no longer linked to the task, so there is nowhere to send it',
  replyNotConnected: 'this host’s Orca is not connected',
  replyInputNotCleared:
    'text left in the session’s input could not be cleared first; open the session to check it',
  replyInputRefused:
    'the session did not take the text, which happens while the agent waits on a choice; open the session',
  replyChatNotReady: 'the chat did not say where the conversation stands; open the session',
  openSession: 'Open session',
  markSeen: 'Mark as seen',
  snooze: 'Snooze',
  snoozeTitle: 'Snooze',
  snoozeChoices: {
    hour: 'For 1 hour',
    tonight: 'Until tonight',
    tomorrow: 'Until tomorrow',
    'next-week': 'Until next week'
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
  inheritedWorkspace: (title: string): string => `Uses the workspace of “${title}”`,
  // Why three: a project without repositories starts in any repository on the host (REQ-009), so
  // each says which repositories Start work looked at and why none of them can hold a new workspace.
  folderProjectHint:
    'The repositories available here are folders, not Git repositories, so no workspace is created; link an existing one.',
  noSetupHint:
    "None of this project's repositories is on this host, so no workspace can be started here.",
  noRepoOnHostHint: 'This host has no repository in Orca yet, so no workspace can be started here.',
  start: 'Start work',
  startOwn: 'Start work separately',
  startAgain: 'Start work again',
  startTitle: (title: string): string => `Start work on “${title}”`,
  startWhere: (name: string, host: string): string =>
    host ? `New workspace ${name} on ${host}` : `New workspace ${name}`,
  changeLocation: 'Change repository or host',
  pickLocation: 'Repository and host',
  openSessionAction: 'New session',
  openSessionTitle: (title: string): string => `New session for “${title}”`,
  noAgents: 'No enabled agent was found on this host.',
  agentsUnreadable: 'The agents on this host could not be read. Close this sheet and try again.',
  agentsHostOffline: (host: string): string =>
    host
      ? `${host} is not connected, so its agents can’t be listed.`
      : 'The workspace’s host is not connected, so its agents can’t be listed.',
  loadingAgents: 'Finding agents…',
  workspaceOnly: 'Just create the workspace',
  workspaceOnlyHint: 'No agent starts; open a session later',
  linkExisting: 'Link an existing workspace',
  linkExistingTitle: (title: string): string => `Link an existing workspace to “${title}”`,
  noWorkspacesToLink: 'No workspaces of this project on its host.',
  searchWorkspaces: 'Search workspace or branch',
  workspaceTaken: (title: string): string => `Belongs to “${title}”`,
  workspaceNotListed: 'This host no longer lists this workspace.',
  unlinkWorkspace: 'Unlink workspace',
  unlinkWorkspaceTitle: 'Unlink this workspace?',
  unlinkWorkspaceMessage:
    'Only the link is removed, together with the sessions linked through it. The workspace and its sessions keep running.',
  unlinkSession: 'Unlink session',
  unlinkSessionTitle: 'Unlink this session?',
  unlinkSessionMessage: 'Only the link is removed. The session keeps running in its workspace.',
  sessionActionsHint: 'Long press to unlink',
  openWorkspace: 'Open workspace',
  // Why no host id: the user never sees one (REQ-017); an unnamed host is described instead.
  hostLocal: 'This computer',
  hostOffline: (host: string): string =>
    host ? `${host} is not connected` : 'The workspace’s host is not connected',
  hostUnknown: 'Can’t confirm the host’s connection',
  checkConnection: 'Check connection',
  catalogUnavailable:
    'This host hasn’t published its repositories yet, so Start work and Link an existing workspace can’t be offered.',
  cannotOpenHere: 'This link was recorded by an older Orca, so it can’t be opened from here.',
  sessionNoLongerRecorded: 'This session is no longer recorded on the task.',
  ofSubtask: (title: string): string => `For “${title}”`,
  sessionStates: {
    working: 'Working',
    waiting: 'Waiting for you',
    blocked: 'Blocked',
    done: 'Finished a turn',
    idle: 'Idle',
    exited: 'Ended',
    missing: 'Session not found',
    unknown: 'Status unknown',
    unverifiable: 'Can’t confirm'
  } satisfies Record<LocalTaskSessionState, string>,
  workspaceGone: 'The workspace was deleted.',
  review: {
    pr: (number: number): string => `PR #${number}`,
    mr: (number: number): string => `MR !${number}`,
    open: (label: string): string => `${label} open`,
    draft: (label: string): string => `${label} draft`,
    merged: (label: string): string => `${label} merged`,
    closed: (label: string): string => `${label} closed`,
    unverifiable: (label: string): string => `${label} state can’t be confirmed`
  },
  checks: {
    success: 'Checks passing',
    failure: 'Checks failing',
    pending: 'Checks running'
  } satisfies Partial<Record<CheckStatus, string>>,
  starting: 'Starting…',
  startedNotLinked:
    'The workspace was created but not linked to the task. Use “Link an existing workspace” to link it.',
  sessionNotRecorded:
    'The agent started, but the session was not recorded on the task. It is in the workspace.',
  promptNotDelivered:
    'The agent started but did not take the task text, which can happen while it shows a prompt of its own. The text is still on the task.',
  launchUnconfirmed: "Couldn't confirm the agent started. Check the workspace before trying again.",
  workspaceUnconfirmed:
    "Couldn't confirm the workspace was created. Check the workspace list before trying again.",
  updateDesktop: "Update this host's Orca to start agents from your phone.",
  linkToTask: 'Link to task…',
  linkToTaskTitle: (workspace: string): string => `Link “${workspace}” to a task`,
  linkSessionToTask: 'Link this session…',
  linkSessionTitle: 'This session works on',
  noOpenTasks: 'No open tasks on this host.',
  hasWorkspace: (name: string): string => `Has ${name}`,
  rulesSection: 'Automatic status rules',
  ruleStart: 'Starting work moves the task to In Progress',
  ruleStartHint:
    'When a workspace or the first session is linked, a Backlog or Todo task moves to the first In Progress status.',
  rulePrMerged: 'A merged PR completes the task',
  rulePrMergedHint: 'Checked on the desktop while its window is open.'
}

export type LocalTasksWorkCopy = typeof LOCAL_TASKS_WORK_COPY_EN
