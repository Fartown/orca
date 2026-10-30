/**
 * The library preference behind Display properties → Local task on sidebar cards. `'0'` hides the
 * task chip; absent (the default) shows it. The host reports it in `localTasks.status` so a phone's
 * workspace rows follow the desktop's card properties, as upstream's row glyphs do.
 */
export const LOCAL_TASK_CARD_SHOW_PREFERENCE_KEY = 'cardShowLocalTask'
