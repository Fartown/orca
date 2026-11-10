import { translate } from '../i18n/mobile-i18n'

/** New task's 在哪做 and 开工 steps (m8); the form's other words are the task page's. */
export function localTaskCreateCopy() {
  return {
    stepTask: translate('localTasks.create.stepTask', 'Task'),
    stepWhere: translate('localTasks.create.stepWhere', 'Where to work'),
    stepKickoff: translate('localTasks.create.stepKickoff', 'Start work'),
    moreProperties: translate('localTasks.create.moreProperties', 'Properties and subtasks'),
    projectFollows: translate('localTasks.create.projectFollows', 'Project follows the repository'),
    whereExisting: translate('localTasks.create.whereExisting', 'Existing workspace'),
    whereNew: translate('localTasks.create.whereNew', 'New workspace'),
    whereLater: translate('localTasks.create.whereLater', 'Decide later'),
    searchWorkspaces: translate('localTasks.create.searchWorkspaces', 'Search workspaces'),
    loadingWorkspaces: translate('localTasks.create.loadingWorkspaces', 'Reading workspaces…'),
    workspacesUnread: translate(
      'localTasks.create.workspacesUnread',
      'Couldn’t read the workspace list. Open New task again to read it again.'
    ),
    noWorkspaces: translate('localTasks.create.noWorkspaces', 'No workspaces on this host yet'),
    noMatches: translate('localTasks.create.noMatches', 'No matching workspaces'),
    showAll: (count: number) =>
      translate('localTasks.create.showAll', 'Show all {{count}}', { count }),
    mainWorkspace: translate('localTasks.create.mainWorkspace', 'Main workspace'),
    folderWorkspace: translate('localTasks.create.folderWorkspace', 'Folder workspace'),
    free: translate('localTasks.create.free', 'Free'),
    ownedSubtask: (ref: string) =>
      translate('localTasks.create.ownedSubtask', 'Belongs to {{ref}} · becomes its subtask', {
        ref
      }),
    noProjectHere: translate(
      'localTasks.create.noProjectHere',
      'No project here can take a new task'
    ),
    notConnected: translate('localTasks.create.notConnected', 'Not connected'),
    hostNotConnected: (host: string) =>
      host
        ? translate('localTasks.create.hostNotConnected', '{{host}} not connected', { host })
        : translate('localTasks.create.notConnected', 'Not connected'),
    repo: translate('localTasks.create.repo', 'Repository'),
    name: translate('localTasks.create.name', 'Name'),
    nameAuto: translate('localTasks.create.nameAuto', 'Named from the task’s ref and title'),
    base: translate('localTasks.create.base', 'Based on'),
    baseDefault: translate('localTasks.create.baseDefault', 'Default branch'),
    repoOnHost: (repo: string, host: string) =>
      host
        ? translate('localTasks.create.repoOnHost', '{{repo}} on {{host}}', { repo, host })
        : repo,
    newNote: (host: string) =>
      translate('localTasks.create.newNote', 'Created on {{host}} the way New workspace does.', {
        host
      }),
    offlineReposNote: (hosts: string) =>
      translate(
        'localTasks.create.offlineReposNote',
        '{{hosts}} not connected, so its repositories can’t be picked now.',
        { hosts }
      ),
    loadingRepos: translate('localTasks.create.loadingRepos', 'Reading repositories…'),
    noRepos: translate(
      'localTasks.create.noRepos',
      'No repository on this host can take a new workspace.'
    ),
    catalogUnavailable: translate(
      'localTasks.create.catalogUnavailable',
      'This host hasn’t published its repositories yet, so a new workspace can’t be made here.'
    ),
    laterNote: translate(
      'localTasks.create.laterNote',
      'Only the task is created: no workspace, no session. Start it later from the task.'
    ),
    noSite: translate(
      'localTasks.create.noSite',
      'This screen can’t reach the task library’s host, so only the task is created.'
    ),
    libraryOffline: (host: string) =>
      translate(
        'localTasks.create.libraryOffline',
        '{{host}} is not connected, so only the task can be created now. Start work from the task once it is back.',
        { host }
      ),
    defaultAgent: translate('localTasks.create.defaultAgent', 'Default agent'),
    notNow: translate('localTasks.create.notNow', 'Not now'),
    notNowHint: translate('localTasks.create.notNowHint', 'Only the task and workspace'),
    moreAgents: translate('localTasks.create.moreAgents', 'Other agents'),
    agentsAfterWhere: translate(
      'localTasks.create.agentsAfterWhere',
      'Agents are listed once you pick where to work.'
    ),
    agentsUnreadable: translate(
      'localTasks.create.agentsUnreadable',
      'Couldn’t read this host’s agents.'
    ),
    firstLine: translate('localTasks.create.firstLine', 'First prompt'),
    firstLineDefault: translate(
      'localTasks.create.firstLineDefault',
      'Start from the task description'
    ),
    sendNow: translate('localTasks.create.sendNow', 'Send now'),
    sendFixed: translate('localTasks.create.sendFixed', 'Fixed on phone'),
    sendFixedHint: translate(
      'localTasks.create.sendFixedHint',
      'The phone can’t put it in the input box first: a host doesn’t deliver drafts started from the phone.'
    ),
    briefNote: translate(
      'localTasks.create.briefNote',
      'The session also gets the task brief: its ref, how to write back progress, and to stop at Ready for acceptance. Can be turned off in Settings.'
    ),
    planLater: translate('localTasks.create.planLater', 'Only the task is created; start it later'),
    planPickWorkspace: translate('localTasks.create.planPickWorkspace', 'Pick a workspace'),
    planPickRepo: translate('localTasks.create.planPickRepo', 'Pick a repository'),
    planFindingAgents: translate('localTasks.create.planFindingAgents', 'Finding agents…'),
    workspaceOnHost: (workspace: string, host: string) =>
      host
        ? translate('localTasks.create.workspaceOnHost', '{{workspace}} ({{host}})', {
            workspace,
            host
          })
        : workspace,
    planExistingSession: (place: string, agent: string) =>
      translate('localTasks.create.planExistingSession', 'Open a {{agent}} session in {{place}}', {
        place,
        agent
      }),
    planExistingLink: (place: string) =>
      translate('localTasks.create.planExistingLink', 'Work in {{place}}, no session', { place }),
    planAsSubtask: (ref: string, plan: string) =>
      translate('localTasks.create.planAsSubtask', 'As a subtask of {{ref}}: {{plan}}', {
        ref,
        plan
      }),
    autoName: translate('localTasks.create.autoName', '(named after the task)'),
    planNewSession: (workspace: string, host: string, agent: string) =>
      translate(
        'localTasks.create.planNewSession',
        'New workspace {{workspace}} on {{host}}, then a {{agent}} session',
        { workspace, host, agent }
      ),
    planNewOnly: (workspace: string, host: string) =>
      translate(
        'localTasks.create.planNewOnly',
        'New workspace {{workspace}} on {{host}}, no session',
        { workspace, host }
      ),
    createAndStart: translate('localTasks.create.createAndStart', 'Create and start'),
    nothingCreated: (reason: string) =>
      translate('localTasks.create.nothingCreated', 'Nothing was created: {{reason}}', { reason }),
    createdNotLinked: (ref: string, workspace: string, reason: string) =>
      translate(
        'localTasks.create.createdNotLinked',
        '{{ref}} was created, but {{workspace}} was not linked to it. {{reason}}',
        { ref, workspace, reason }
      ),
    createdNotStarted: (ref: string, reason: string) =>
      translate('localTasks.create.createdNotStarted', '{{ref}} was created. {{reason}}', {
        ref,
        reason
      })
  }
}

export type LocalTaskCreateCopy = ReturnType<typeof localTaskCreateCopy>
