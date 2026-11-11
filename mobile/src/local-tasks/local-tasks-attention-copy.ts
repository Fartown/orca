import type { LocalTaskAttentionKind } from '../../../src/shared/local-tasks/local-task-link-types'
import type { LocalTaskSnoozePreset } from '../../../src/shared/local-tasks/local-task-snooze-presets'
import { translate } from '../i18n/mobile-i18n'
import type { LocalTaskReplyStatus } from './use-local-task-attention-actions'

/** "Needs you": what waits on the user, replying to a session, and snoozing it. */
export function localTasksAttentionCopy() {
  const snooze = translate('localTasks.work.snooze.label', 'Snooze')
  return {
    segmentAttention: translate('localTasks.work.attention.segment', 'Needs you'),
    homeNeedsYou: (count: number): string =>
      translate('localTasks.work.attention.homeCount', 'Needs you {{count}}', { count }),
    attentionUnverifiable: (host: string): string =>
      host
        ? translate(
            'localTasks.work.attention.unverifiable',
            '{{host}} is not connected, so what needs you can’t be confirmed.',
            { host }
          )
        : translate(
            'localTasks.work.attention.unverifiableUnnamed',
            'This host’s Orca is not connected, so what needs you can’t be confirmed.'
          ),
    // The library is in contact, but some of its sessions run on a host it cannot reach.
    attentionUnverifiableHosts: translate(
      'localTasks.work.attention.unverifiableHosts',
      'Nothing is waiting on you on the hosts in contact. Sessions on hosts that are not connected can’t be confirmed until they are back.'
    ),
    attentionEmpty: translate(
      'localTasks.work.attention.empty',
      'No session on a task is waiting on you.'
    ),
    attentionLoading: translate('localTasks.work.attention.loading', 'Reading session status…'),
    workLoadFailed: translate(
      'localTasks.work.loadFailed',
      'Workspaces and sessions could not be read.'
    ),
    attentionKinds: {
      approval: translate('localTasks.work.attentionKind.approval', 'Waiting for your approval'),
      question: translate('localTasks.work.attentionKind.question', 'Waiting for your answer'),
      blocked: translate('localTasks.work.attentionKind.blocked', 'Blocked'),
      'unread-done': translate(
        'localTasks.work.attentionKind.unreadDone',
        'Finished a turn you have not seen'
      )
    } satisfies Record<LocalTaskAttentionKind, string>,
    agentSaid: (agent: string, message: string): string =>
      translate('localTasks.work.agentSaid', '{{agent}}: “{{message}}”', { agent, message }),
    agentStopped: (agent: string): string =>
      translate('localTasks.work.agentStopped', '{{agent}} stopped', { agent }),
    someAgent: translate('localTasks.work.someAgent', 'The agent'),
    reply: translate('localTasks.work.reply.label', 'Reply'),
    replyTitle: (title: string): string =>
      translate('localTasks.work.reply.title', 'Reply in “{{title}}”', { title }),
    replyPlaceholder: translate(
      'localTasks.work.reply.placeholder',
      'Next instruction for the agent…'
    ),
    replyReconnecting: translate('localTasks.work.reply.reconnecting', 'Reconnecting…'),
    replyDisconnected: (host: string): string =>
      host
        ? translate(
            'localTasks.work.reply.disconnected',
            '{{host}} is not connected, so the reply can’t be sent now. Your text stays here.',
            { host }
          )
        : translate(
            'localTasks.work.reply.disconnectedUnnamed',
            'This host’s Orca is not connected, so the reply can’t be sent now. Your text stays here.'
          ),
    // Each reason below finishes "Not sent: …", so it is a clause, not a sentence.
    replySessionMissing: translate(
      'localTasks.work.reply.sessionMissing',
      'this session’s terminal is no longer listed; open the session instead'
    ),
    replyNoSession: translate(
      'localTasks.work.reply.noSession',
      'this session is no longer linked to the task, so there is nowhere to send it'
    ),
    replyNotConnected: translate(
      'localTasks.work.reply.notConnected',
      'this host’s Orca is not connected'
    ),
    replyInputNotCleared: translate(
      'localTasks.work.reply.inputNotCleared',
      'text left in the session’s input could not be cleared first; open the session to check it'
    ),
    replyInputRefused: translate(
      'localTasks.work.reply.inputRefused',
      'the session did not take the text, which happens while the agent waits on a choice; open the session'
    ),
    replyChatNotReady: translate(
      'localTasks.work.reply.chatNotReady',
      'the chat did not say where the conversation stands; open the session'
    ),
    openSession: translate('localTasks.work.openSession', 'Open session'),
    markSeen: translate('localTasks.work.markSeen', 'Mark as seen'),
    snooze,
    snoozeTitle: snooze,
    snoozeChoices: {
      hour: translate('localTasks.work.snooze.hour', 'For 1 hour'),
      tonight: translate('localTasks.work.snooze.tonight', 'Until tonight'),
      tomorrow: translate('localTasks.work.snooze.tomorrow', 'Until tomorrow'),
      'next-week': translate('localTasks.work.snooze.nextWeek', 'Until next week')
    } satisfies Record<LocalTaskSnoozePreset, string>,
    itemActions: translate('localTasks.work.itemActions', 'Item actions'),
    replyStates: {
      sending: translate('localTasks.work.reply.sending', 'Sending…'),
      delivered: translate('localTasks.work.reply.delivered', 'Delivered'),
      unconfirmed: translate(
        'localTasks.work.reply.unconfirmed',
        'Sent, but not confirmed. Check the session before sending again.'
      )
    } satisfies Record<Exclude<LocalTaskReplyStatus['kind'], 'not-sent'>, string>,
    replyNotSent: translate(
      'localTasks.work.reply.notSent',
      'Not sent. Your reply is back in the box.'
    ),
    replyNotSentBecause: (reason: string): string =>
      translate(
        'localTasks.work.reply.notSentBecause',
        'Not sent: {{reason}}. Your reply is back in the box.',
        { reason }
      ),
    editReply: translate('localTasks.work.reply.edit', 'Edit and send again')
  }
}
