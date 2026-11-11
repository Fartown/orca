import { translate } from '../i18n/mobile-i18n'

/** Copy for the home card and the task page's "Now", localized from the start. */
export function localTasksPageCopy() {
  return {
    homeNeedsYou: translate('localTasks.page.homeNeedsYou', 'Needs you'),
    homeInProgress: translate('localTasks.page.homeInProgress', 'In progress'),
    homeLatest: (source: string): string =>
      translate('localTasks.page.homeLatest', 'Latest progress · {{source}}', { source }),
    homeViewAll: (count: number): string =>
      translate('localTasks.page.homeViewAll', 'View all {{count}}', { count }),
    latestProgress: translate('localTasks.page.latestProgress', 'Latest progress'),
    writebackNumber: (number: number): string =>
      translate('localTasks.page.writebackNumber', 'Writeback #{{number}}', { number }),
    noWriteback: translate('localTasks.page.noWriteback', 'No writeback yet'),
    allProgress: (count: number): string =>
      translate('localTasks.page.allProgress', 'All progress {{count}}', { count }),
    collapse: translate('localTasks.page.collapse', 'Collapse'),
    expand: translate('localTasks.page.expand', 'Expand'),
    selfCheck: translate('localTasks.page.selfCheck', 'Self-check'),
    whereToVerify: translate('localTasks.page.whereToVerify', 'Where to verify'),
    mergedInto: translate('localTasks.page.mergedInto', 'Merged into')
  }
}
