import { translate } from '../i18n/mobile-i18n'
import { LOCAL_TASKS_COPY_EN } from './local-tasks-copy-en'

export type LocalTasksCopy = typeof LOCAL_TASKS_COPY_EN & {
  title: string
  description: string
  now: string
  noProgress: string
  systemRecords: string
  prMergedRule: string
  prMergedModes: { none: string; review: string; completed: string }
  acceptReview: string
  rejectReview: string
  rejectReason: string
  dispatchPlaceholder: string
  dispatchButton: string
  dispatchRunOn: string
  dispatchNoSetup: string
  dispatchHost: string
  dispatchRepo: string
  dispatchWorkspace: string
  dispatchTask: string
  dispatchTarget: string
  dispatchChooseTarget: string
}

// Why mostly English: this copy predates the mobile catalog; entries move to translate() as
// they are localized.
export function localTasksCopy(): LocalTasksCopy {
  return {
    ...LOCAL_TASKS_COPY_EN,
    defaultStatusNames: {
      ...LOCAL_TASKS_COPY_EN.defaultStatusNames,
      review: translate('localTasks.defaultStatus.review', 'Ready for acceptance')
    },
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
