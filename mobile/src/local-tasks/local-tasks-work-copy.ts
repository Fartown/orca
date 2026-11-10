import type { CheckStatus } from '../../../src/shared/github/pull-request-types'
import type { LocalTaskSessionState } from '../../../src/shared/local-tasks/local-task-link-types'
import { translate } from '../i18n/mobile-i18n'
import { localTasksAttentionCopy } from './local-tasks-attention-copy'
import { localTaskHostOfflineUnnamed, localTasksWorkCardCopy } from './local-tasks-work-card-copy'

/** Workspaces, sessions, "Needs you", replies and the two automatic rules. */
export function localTasksWorkCopy() {
  return {
    ...localTasksAttentionCopy(),
    ...localTasksWorkCardCopy(),
    workspaceSection: translate('localTasks.work.workspace.section', 'Workspace'),
    sessionsSection: translate('localTasks.work.session.section', 'Sessions'),
    noWorkspace: translate('localTasks.work.workspace.none', 'No workspace yet.'),
    inheritedWorkspace: (title: string): string =>
      translate('localTasks.work.workspace.inherited', 'Uses the workspace of “{{title}}”', {
        title
      }),
    // Why three: a project without repositories starts in any repository on the host, so each
    // says which repositories Start work looked at and why none of them can hold a new workspace.
    folderProjectHint: translate(
      'localTasks.work.start.folderHint',
      'The repositories available here are folders, not Git repositories, so no workspace is created; link an existing one.'
    ),
    noSetupHint: translate(
      'localTasks.work.start.noSetupHint',
      "None of this project's repositories is on this host, so no workspace can be started here."
    ),
    noRepoOnHostHint: translate(
      'localTasks.work.start.noRepoOnHostHint',
      'This host has no repository in Orca yet, so no workspace can be started here.'
    ),
    start: translate('localTasks.work.start.label', 'Start work'),
    startOwn: translate('localTasks.work.start.own', 'Start work separately'),
    startAgain: translate('localTasks.work.start.again', 'Start work again'),
    startTitle: (title: string): string =>
      translate('localTasks.work.start.title', 'Start work on “{{title}}”', { title }),
    startWhere: (name: string, host: string): string =>
      host
        ? translate('localTasks.work.start.whereOn', 'New workspace {{name}} on {{host}}', {
            name,
            host
          })
        : translate('localTasks.work.start.where', 'New workspace {{name}}', { name }),
    changeLocation: translate('localTasks.work.start.changeLocation', 'Change repository or host'),
    pickLocation: translate('localTasks.work.start.pickLocation', 'Repository and host'),
    openSessionAction: translate('localTasks.work.session.new', 'New session'),
    openSessionTitle: (title: string): string =>
      translate('localTasks.work.session.newTitle', 'New session for “{{title}}”', { title }),
    noAgents: translate('localTasks.work.agents.none', 'No enabled agent was found on this host.'),
    agentsUnreadable: translate(
      'localTasks.work.agents.unreadable',
      'The agents on this host could not be read. Close this sheet and try again.'
    ),
    agentsHostOffline: (host: string): string =>
      host
        ? translate(
            'localTasks.work.agents.hostOffline',
            '{{host}} is not connected, so its agents can’t be listed.',
            { host }
          )
        : translate(
            'localTasks.work.agents.hostOfflineUnnamed',
            'The workspace’s host is not connected, so its agents can’t be listed.'
          ),
    loadingAgents: translate('localTasks.work.agents.loading', 'Finding agents…'),
    workspaceOnly: translate('localTasks.work.start.workspaceOnly', 'Just create the workspace'),
    workspaceOnlyHint: translate(
      'localTasks.work.start.workspaceOnlyHint',
      'No agent starts; open a session later'
    ),
    linkExisting: translate('localTasks.work.workspace.linkExisting', 'Link an existing workspace'),
    linkExistingTitle: (title: string): string =>
      translate(
        'localTasks.work.workspace.linkExistingTitle',
        'Link an existing workspace to “{{title}}”',
        { title }
      ),
    noWorkspacesToLink: translate(
      'localTasks.work.workspace.noneToLink',
      'No workspaces of this project on its host.'
    ),
    searchWorkspaces: translate('localTasks.work.workspace.search', 'Search workspace or branch'),
    workspaceTaken: (title: string): string =>
      translate('localTasks.work.workspace.taken', 'Belongs to “{{title}}”', { title }),
    workspaceNotListed: translate(
      'localTasks.work.workspace.notListed',
      'This host no longer lists this workspace.'
    ),
    unlinkWorkspace: translate('localTasks.work.workspace.unlink', 'Unlink workspace'),
    unlinkWorkspaceTitle: translate(
      'localTasks.work.workspace.unlinkTitle',
      'Unlink this workspace?'
    ),
    unlinkWorkspaceMessage: translate(
      'localTasks.work.workspace.unlinkMessage',
      'Only the link is removed, together with the sessions linked through it. The workspace and its sessions keep running.'
    ),
    unlinkSession: translate('localTasks.work.session.unlink', 'Unlink session'),
    unlinkSessionTitle: translate('localTasks.work.session.unlinkTitle', 'Unlink this session?'),
    unlinkSessionMessage: translate(
      'localTasks.work.session.unlinkMessage',
      'Only the link is removed. The session keeps running in its workspace.'
    ),
    sessionActionsHint: translate('localTasks.work.session.actionsHint', 'Long press to unlink'),
    openWorkspace: translate('localTasks.work.workspace.open', 'Open workspace'),
    // Why no host id: the user never sees one; an unnamed host is described instead.
    hostLocal: translate('localTasks.work.host.local', 'This computer'),
    hostOffline: (host: string): string =>
      host
        ? translate('localTasks.work.host.offline', '{{host}} is not connected', { host })
        : localTaskHostOfflineUnnamed(),
    hostUnknown: translate('localTasks.work.host.unknown', 'Can’t confirm the host’s connection'),
    checkConnection: translate('localTasks.work.host.checkConnection', 'Check connection'),
    catalogUnavailable: translate(
      'localTasks.work.start.catalogUnavailable',
      'This host hasn’t published its repositories yet, so Start work and Link an existing workspace can’t be offered.'
    ),
    cannotOpenHere: translate(
      'localTasks.work.session.cannotOpenHere',
      'This link was recorded by an older Orca, so it can’t be opened from here.'
    ),
    sessionNoLongerRecorded: translate(
      'localTasks.work.session.noLongerRecorded',
      'This session is no longer recorded on the task.'
    ),
    ofSubtask: (title: string): string =>
      translate('localTasks.work.session.ofSubtask', 'For “{{title}}”', { title }),
    sessionStates: {
      working: translate('localTasks.work.sessionState.working', 'Working'),
      waiting: translate('localTasks.work.sessionState.waiting', 'Waiting for you'),
      blocked: translate('localTasks.work.sessionState.blocked', 'Blocked'),
      done: translate('localTasks.work.sessionState.done', 'Finished a turn'),
      idle: translate('localTasks.work.sessionState.idle', 'Idle'),
      exited: translate('localTasks.work.sessionState.exited', 'Ended'),
      missing: translate('localTasks.work.sessionState.missing', 'Session not found'),
      unknown: translate('localTasks.work.sessionState.unknown', 'Status unknown'),
      unverifiable: translate('localTasks.work.sessionState.unverifiable', 'Can’t confirm')
    } satisfies Record<LocalTaskSessionState, string>,
    workspaceGone: translate('localTasks.work.workspace.gone', 'The workspace was deleted.'),
    review: {
      pr: (number: number): string =>
        translate('localTasks.work.review.pr', 'PR #{{number}}', { number }),
      mr: (number: number): string =>
        translate('localTasks.work.review.mr', 'MR !{{number}}', { number }),
      open: (label: string): string =>
        translate('localTasks.work.review.open', '{{label}} open', { label }),
      draft: (label: string): string =>
        translate('localTasks.work.review.draft', '{{label}} draft', { label }),
      merged: (label: string): string =>
        translate('localTasks.work.review.merged', '{{label}} merged', { label }),
      closed: (label: string): string =>
        translate('localTasks.work.review.closed', '{{label}} closed', { label }),
      unverifiable: (label: string): string =>
        translate('localTasks.work.review.unverifiable', '{{label}} state can’t be confirmed', {
          label
        })
    },
    checks: {
      success: translate('localTasks.work.checks.success', 'Checks passing'),
      failure: translate('localTasks.work.checks.failure', 'Checks failing'),
      pending: translate('localTasks.work.checks.pending', 'Checks running')
    } satisfies Partial<Record<CheckStatus, string>>,
    starting: translate('localTasks.work.launch.starting', 'Starting…'),
    startedNotLinked: translate(
      'localTasks.work.launch.startedNotLinked',
      'The workspace was created but not linked to the task. Use “Link an existing workspace” to link it.'
    ),
    sessionNotRecorded: translate(
      'localTasks.work.launch.sessionNotRecorded',
      'The agent started, but the session was not recorded on the task. It is in the workspace.'
    ),
    promptNotDelivered: translate(
      'localTasks.work.launch.promptNotDelivered',
      'The agent started but did not take the task text, which can happen while it shows a prompt of its own. The text is still on the task.'
    ),
    launchUnconfirmed: translate(
      'localTasks.work.launch.unconfirmed',
      "Couldn't confirm the agent started. Check the workspace before trying again."
    ),
    workspaceUnconfirmed: translate(
      'localTasks.work.launch.workspaceUnconfirmed',
      "Couldn't confirm the workspace was created. Check the workspace list before trying again."
    ),
    updateDesktop: translate(
      'localTasks.work.launch.updateDesktop',
      "Update this host's Orca to start agents from your phone."
    ),
    linkToTask: translate('localTasks.work.link.toTask', 'Link to task…'),
    linkToTaskTitle: (workspace: string): string =>
      translate('localTasks.work.link.toTaskTitle', 'Link “{{workspace}}” to a task', {
        workspace
      }),
    linkSessionToTask: translate('localTasks.work.link.session', 'Link this session…'),
    linkSessionTitle: translate('localTasks.work.link.sessionTitle', 'This session works on'),
    noOpenTasks: translate('localTasks.work.link.noOpenTasks', 'No open tasks on this host.'),
    hasWorkspace: (name: string): string =>
      translate('localTasks.work.link.hasWorkspace', 'Has {{name}}', { name }),
    rulesSection: translate('localTasks.work.rules.section', 'Automatic status rules'),
    ruleStart: translate(
      'localTasks.work.rules.start',
      'Starting work moves the task to In Progress'
    ),
    ruleStartHint: translate(
      'localTasks.work.rules.startHint',
      'When a workspace or the first session is linked, a Backlog or Todo task moves to the first In Progress status.'
    ),
    rulePrMerged: translate('localTasks.work.rules.prMerged', 'A merged PR completes the task'),
    rulePrMergedHint: translate(
      'localTasks.work.rules.prMergedHint',
      'Checked on the desktop while its window is open.'
    )
  }
}

export type LocalTasksWorkCopy = ReturnType<typeof localTasksWorkCopy>
