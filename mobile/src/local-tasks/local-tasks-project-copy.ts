import { translate } from '../i18n/mobile-i18n'

/** Project settings: name, repositories, ref prefix, statuses, and creating projects. */
export function localTasksProjectCopy() {
  return {
    settingsTitle: translate('localTasks.project.settingsTitle', 'Settings'),
    projectSection: translate('localTasks.project.section', 'Project'),
    name: translate('localTasks.project.name', 'Name'),
    reposSection: translate('localTasks.repos.section', 'Repositories'),
    repoNameUnread: translate('localTasks.repos.nameUnread', 'Repository (name not read yet)'),
    repoNotInOrca: translate('localTasks.repos.notInOrca', 'A repository no longer in Orca'),
    defaultRepo: translate('localTasks.repos.default', 'Default'),
    noReposHint: translate(
      'localTasks.repos.noneHint',
      'None: this project only tracks tasks. Start work then picks from every repository on this host.'
    ),
    addRepo: translate('localTasks.repos.add', 'Add repository'),
    reposAtLimit: (limit: number): string =>
      translate(
        'localTasks.repos.atLimit',
        'A project links up to {{limit}} repositories. Remove one to add another.',
        { limit }
      ),
    noRepoCandidates: translate(
      'localTasks.repos.noCandidates',
      'No other repository in Orca on this host.'
    ),
    makeDefaultRepo: translate('localTasks.repos.makeDefault', 'Make default'),
    removeRepo: translate('localTasks.repos.remove', 'Remove from project'),
    prefix: translate('localTasks.prefix.label', 'Ref prefix'),
    prefixHint: (aliases: string): string =>
      aliases
        ? translate(
            'localTasks.prefix.hintAliases',
            'Earlier prefixes {{aliases}} stay as aliases: their refs still find these tasks, and no other project can take them.',
            { aliases }
          )
        : translate(
            'localTasks.prefix.hint',
            'Changing the prefix keeps the old one as an alias: old refs still find these tasks, and no other project can take it.'
          ),
    prefixInvalid: translate(
      'localTasks.prefix.invalid',
      'Use 1–10 capital letters or digits, starting with a letter.'
    ),
    nameRequired: translate('localTasks.project.nameRequired', 'Give the project a name.'),
    renameProject: translate('localTasks.project.rename', 'Rename project'),
    changePrefix: translate('localTasks.prefix.change', 'Change prefix'),
    changePrefixConfirm: (from: string, to: string): string =>
      translate(
        'localTasks.prefix.changeConfirm',
        'Change {{from}} to {{to}}? {{from}} stays as an alias of this project.',
        { from, to }
      ),
    deleteProject: translate('localTasks.project.delete', 'Delete project…'),
    deleteProjectTitle: (name: string): string =>
      translate('localTasks.project.deleteTitle', 'Delete {{name}}?', { name }),
    deleteProjectMessage: (count: number): string =>
      translate(
        'localTasks.project.deleteMessage',
        'Its tasks ({{count}}) are deleted with it. Its repositories, their workspaces and sessions are not touched.',
        { count }
      ),
    deletingProject: translate('localTasks.project.deleting', 'Deleting the project…'),
    confirmDeleteProject: translate('localTasks.project.confirmDelete', 'Delete project'),
    statusesSection: translate('localTasks.statuses.section', 'Statuses'),
    statusesHint: translate(
      'localTasks.statuses.hint',
      'The six categories are fixed. Inside one you can add, rename, recolor and reorder statuses; a status never changes category, and each category keeps at least one.'
    ),
    addStatus: translate('localTasks.statuses.add', 'Add status'),
    statusTaskCount: (count: number): string =>
      translate('localTasks.statuses.taskCount', 'Tasks: {{count}}', { count }),
    newStatusName: translate('localTasks.statuses.newName', 'Status name'),
    renameStatus: translate('localTasks.statuses.rename', 'Rename'),
    statusColor: translate('localTasks.statuses.color', 'Status color'),
    moveUp: translate('localTasks.statuses.moveUp', 'Move up'),
    moveDown: translate('localTasks.statuses.moveDown', 'Move down'),
    firstInCategory: translate(
      'localTasks.statuses.firstInCategory',
      'Already first in its category'
    ),
    lastInCategory: translate('localTasks.statuses.lastInCategory', 'Already last in its category'),
    deleteStatus: translate('localTasks.statuses.remove', 'Remove status'),
    removeStatusTitle: (name: string): string =>
      translate('localTasks.statuses.removeTitle', 'Remove “{{name}}”?', { name }),
    removeStatusUnused: translate('localTasks.statuses.removeUnused', 'No task uses this status.'),
    lastStatusInCategory: translate(
      'localTasks.statuses.lastInCategoryRemove',
      'The only status in its category can’t be removed.'
    ),
    moveTasksTitle: (count: number): string =>
      translate(
        'localTasks.statuses.moveTasksTitle',
        'Tasks using this status: {{count}}. Choose where they go.',
        { count }
      ),
    newProjectTitle: translate('localTasks.newProject.title', 'New project'),
    newProjectHint: translate(
      'localTasks.newProject.hint',
      'Pick the repositories to track, one project each, check their prefixes and create them; or start an empty project and add repositories later.'
    ),
    emptyProjectTitle: translate('localTasks.newProject.emptyTitle', 'Or start an empty project'),
    emptyProject: translate('localTasks.newProject.empty', 'Empty project'),
    emptyProjectHint: translate(
      'localTasks.newProject.emptyHint',
      'Only tasks for now; link repositories later'
    ),
    createEmptyProject: translate('localTasks.newProject.createEmpty', 'Create empty project'),
    createSelected: (count: number): string =>
      translate('localTasks.newProject.createSelected', 'Create selected ({{count}})', { count }),
    continueWithCreated: translate(
      'localTasks.newProject.continueWithCreated',
      'Continue with created projects'
    ),
    prefixFor: (name: string): string =>
      translate('localTasks.newProject.prefixFor', 'Prefix for {{name}}', { name }),
    orcaProjectsUnavailable: translate(
      'localTasks.newProject.reposUnavailable',
      'This host hasn’t published its repositories yet, so they can’t be listed here.'
    ),
    orcaProjectLinked: (name: string): string =>
      translate('localTasks.newProject.alsoIn', 'Also in {{name}}', { name }),
    noOrcaProjects: translate(
      'localTasks.newProject.noRepos',
      'No repositories in Orca on this host yet. Make an empty project, or add a repository to Orca first.'
    )
  }
}
