/** Create From → Local's own words, matching the desktop's Local tab; the rest is the task page's. */
export const LOCAL_TASK_CREATE_SOURCE_COPY_EN = {
  placeholder: 'Search local tasks by title or ref',
  offline: (host: string): string =>
    `${host} is not connected, so tasks can’t be linked now. The tasks below are as last read.`,
  readOnly: 'This task library is read-only here. Update Orca to link tasks.',
  unavailable: 'The task library is not available now.',
  clearTask: 'Clear selected task'
}
