import { getMobileUiRevision, translate } from '../i18n/mobile-i18n'
import { localTasksFailureCopy } from './local-tasks-failure-copy'
import { localTasksLibraryCopy } from './local-tasks-library-copy'
import { localTasksProjectCopy } from './local-tasks-project-copy'
import { localTasksTaskCopy } from './local-tasks-task-copy'
import { localTasksWorkCopy } from './local-tasks-work-copy'

function buildLocalTasksCopy() {
  return {
    ...localTasksLibraryCopy(),
    ...localTasksTaskCopy(),
    ...localTasksProjectCopy(),
    ...localTasksFailureCopy(),
    work: localTasksWorkCopy(),
    title: translate('localTasks.title', 'Local tasks'),
    description: translate('localTasks.description', 'Description'),
    now: translate('localTasks.now', 'Now'),
    noProgress: translate('localTasks.noProgress', 'No progress yet'),
    systemRecords: translate('localTasks.systemRecords', 'System records'),
    prMergedRule: translate('localTasks.prMergedRule', 'When a PR merges'),
    prMergedModes: {
      none: translate('localTasks.prMergedModes.none', 'Keep the current status'),
      review: translate('localTasks.prMergedModes.review', 'Move to review'),
      completed: translate('localTasks.prMergedModes.completed', 'Complete the task')
    },
    acceptReview: translate('localTasks.acceptReview', 'Accept'),
    rejectReview: translate('localTasks.rejectReview', 'Send back'),
    rejectReason: translate('localTasks.rejectReason', 'What needs fixing?'),
    dispatchPlaceholder: translate('localTasks.dispatchPlaceholder', 'What should the agent do?'),
    dispatchButton: translate('localTasks.dispatchButton', 'Start task'),
    dispatchRunOn: translate('localTasks.dispatchRunOn', 'Run on'),
    dispatchNoSetup: translate(
      'localTasks.dispatchNoSetup',
      'Choose a project with a repository to start work'
    ),
    dispatchHost: translate('localTasks.dispatchHost', 'Host'),
    dispatchRepo: translate('localTasks.dispatchRepo', 'Repository'),
    dispatchWorkspace: translate('localTasks.dispatchWorkspace', 'Workspace'),
    dispatchTask: translate('localTasks.dispatchTask', 'Task'),
    dispatchTarget: translate('localTasks.dispatchTarget', 'Target'),
    dispatchChooseTarget: translate('localTasks.dispatchChooseTarget', 'Choose a target')
  }
}

export type LocalTasksCopy = ReturnType<typeof buildLocalTasksCopy>

let built: { revision: number; copy: LocalTasksCopy } | undefined

// Rebuilt when the language changes, not per call: task cards ask for it several times per row.
export function localTasksCopy(): LocalTasksCopy {
  const revision = getMobileUiRevision()
  if (built?.revision !== revision) {
    built = { revision, copy: buildLocalTasksCopy() }
  }
  return built.copy
}

export function formatLocalTaskAgo(copy: LocalTasksCopy, at: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - at) / 60_000)
  if (minutes < 1) {
    return copy.justNow
  }
  if (minutes < 60) {
    return copy.minutesAgo(minutes)
  }
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? copy.hoursAgo(hours) : copy.daysAgo(Math.floor(hours / 24))
}
