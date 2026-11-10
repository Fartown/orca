import { translate } from '../i18n/mobile-i18n'

/**
 * Create From → Local's own words, matching the desktop's Local tab; the rest is the task page's.
 * Getters, so each read follows the phone's current language.
 */
export const LOCAL_TASK_CREATE_SOURCE_COPY_EN = {
  get placeholder(): string {
    return translate('localTasks.sourceTab.placeholder', 'Search local tasks by title or ref')
  },
  offline: (host: string): string =>
    translate(
      'localTasks.sourceTab.offline',
      '{{host}} is not connected, so tasks can’t be linked now. The tasks below are as last read.',
      { host }
    ),
  get readOnly(): string {
    return translate(
      'localTasks.sourceTab.readOnly',
      'This task library is read-only here. Update Orca to link tasks.'
    )
  },
  get unavailable(): string {
    return translate('localTasks.sourceTab.unavailable', 'The task library is not available now.')
  },
  get clearTask(): string {
    return translate('localTasks.sourceTab.clearTask', 'Clear selected task')
  }
}
