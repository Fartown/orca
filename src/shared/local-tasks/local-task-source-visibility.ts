/**
 * The library preference that hides Local from the task sources, as Settings → Task sources hides
 * an upstream provider. `'1'` means hidden; absent (the default) means shown. The host reports it
 * in `localTasks.status` so a phone follows the desktop's choice without reading preferences.
 */
export const LOCAL_TASK_SOURCE_HIDDEN_PREFERENCE_KEY = 'taskSourceHidden'
