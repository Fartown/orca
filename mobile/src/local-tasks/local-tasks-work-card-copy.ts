import type { LocalTaskSessionSurface } from '../../../src/shared/local-tasks/local-task-link-types'
import { translate } from '../i18n/mobile-i18n'

export function localTaskHostOfflineUnnamed(): string {
  return translate('localTasks.work.hostOfflineUnnamed', 'The workspace’s host is not connected')
}

function noWorkspaceYet(): string {
  return translate('localTasks.work.card.noWorkspace', 'No workspace yet')
}

function cardDuration(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000)
  if (minutes < 1) {
    return translate('localTasks.work.card.durationJustStarted', 'just started')
  }
  if (minutes < 60) {
    return translate('localTasks.work.card.durationMinutes', '{{count}}m', { count: minutes })
  }
  const hours = Math.floor(minutes / 60)
  return hours < 24
    ? translate('localTasks.work.card.durationHours', '{{count}}h', { count: hours })
    : translate('localTasks.work.card.durationDays', '{{count}}d', {
        count: Math.floor(hours / 24)
      })
}

/** The task card, the dispatch box and its mention panel. */
export function localTasksWorkCardCopy() {
  return {
    surfaces: {
      terminal: translate('localTasks.work.surface.terminal', 'Terminal'),
      chat: translate('localTasks.work.surface.chat', 'Chat')
    } satisfies Record<LocalTaskSessionSurface, string>,
    card: {
      noWorkspace: noWorkspaceYet(),
      hostOffline: (host: string): string =>
        host
          ? translate('localTasks.work.card.hostOffline', '{{host}} not connected', { host })
          : localTaskHostOfflineUnnamed(),
      lastProgress: (ago: string): string =>
        translate('localTasks.work.card.lastProgress', 'last progress {{ago}}', { ago }),
      writeback: translate('localTasks.work.card.writeback', 'Writeback'),
      lastLine: translate('localTasks.work.card.lastLine', 'Last line'),
      sessionStarted: translate(
        'localTasks.work.card.sessionStarted',
        'Session started · waiting for the first writeback'
      ),
      fromSubtask: (ref: string): string =>
        translate('localTasks.work.card.fromSubtask', '{{ref}}: ', { ref }),
      subtasks: (count: number): string =>
        translate('localTasks.work.card.subtasks', 'Subtasks {{count}}', { count }),
      subtasksNone: translate('localTasks.work.card.subtasksNone', 'no session yet'),
      subtasksAllDone: translate('localTasks.work.card.subtasksAllDone', 'all finished a turn'),
      subtasksWaiting: (count: number): string =>
        translate('localTasks.work.card.subtasksWaiting', '{{count}} waiting for you', { count }),
      subtasksWorking: (count: number): string =>
        translate('localTasks.work.card.subtasksWorking', '{{count}} working', { count }),
      subtasksLatest: (ref: string): string =>
        translate('localTasks.work.card.subtasksLatest', 'Latest: {{ref}}', { ref }),
      awaitingAcceptance: translate(
        'localTasks.work.card.awaitingAcceptance',
        'Awaiting acceptance'
      ),
      moreInNeedsYou: (count: number): string =>
        translate('localTasks.work.card.moreInNeedsYou', '{{count}} more in Needs you', {
          count
        }),
      preview: translate('localTasks.work.card.preview', 'Preview'),
      openFullSession: translate('localTasks.work.card.openFullSession', 'Open full session'),
      remindLater: translate('localTasks.work.card.remindLater', 'Remind later'),
      goReview: translate('localTasks.work.card.goReview', 'Review'),
      duration: cardDuration
    },
    dispatch: {
      placeholder: translate(
        'localTasks.work.dispatch.placeholder',
        'What needs doing? @ a workspace or repository, then say it'
      ),
      mention: translate(
        'localTasks.work.dispatch.mention',
        'Mention a workspace, repository, task or host'
      ),
      clearTarget: translate('localTasks.work.dispatch.clearTarget', 'Remove target'),
      runBy: (host: string): string =>
        host
          ? translate(
              'localTasks.work.dispatch.runBy',
              'Run by {{host}} · tasks live in its library, the phone reads and writes through it',
              { host }
            )
          : translate(
              'localTasks.work.dispatch.runByPaired',
              'Tasks live in the library of the host this phone is paired with'
            ),
      onSendWorkspace: (workspace: string, host: string): string =>
        host
          ? translate(
              'localTasks.work.dispatch.onSendWorkspaceOn',
              'On send: a task in {{workspace}} ({{host}}), with a new session',
              { workspace, host }
            )
          : translate(
              'localTasks.work.dispatch.onSendWorkspace',
              'On send: a task in {{workspace}}, with a new session',
              { workspace }
            ),
      onSendTask: (ref: string): string =>
        translate('localTasks.work.dispatch.onSendTask', 'On send: work continues under {{ref}}', {
          ref
        })
    },
    mention: {
      title: translate('localTasks.work.mention.title', 'Mention'),
      hint: translate(
        'localTasks.work.mention.hint',
        'Each row says which host it is on; what is on a host that is not connected can’t be picked.'
      ),
      search: translate(
        'localTasks.work.mention.search',
        'Search workspaces, repositories, tasks, hosts'
      ),
      workspaces: translate('localTasks.work.mention.workspaces', 'Workspaces'),
      repositories: translate('localTasks.work.mention.repositories', 'Repositories'),
      tasks: translate('localTasks.work.mention.tasks', 'Tasks'),
      hosts: translate('localTasks.work.mention.hosts', 'Hosts'),
      belongsTo: (ref: string): string =>
        translate('localTasks.work.mention.belongsTo', 'Belongs to {{ref}}', { ref }),
      newWorkspaceHere: translate(
        'localTasks.work.mention.newWorkspaceHere',
        'A new workspace is created in it'
      ),
      noWorkspace: noWorkspaceYet(),
      libraryHost: translate('localTasks.work.mention.libraryHost', 'Holds the task library'),
      sshHost: translate('localTasks.work.mention.sshHost', 'SSH host'),
      hostConnected: translate('localTasks.work.mention.hostConnected', 'connected'),
      hostNotConnected: translate('localTasks.work.mention.hostNotConnected', 'not connected')
    }
  }
}
