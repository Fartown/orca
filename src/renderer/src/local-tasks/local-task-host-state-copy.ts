import { translate } from '@/i18n/i18n'

/**
 * Turns the host's raw reason (often an SQLite or file-system message) into one sentence a user
 * can act on; the raw text stays available as a detail.
 */
export function describeLocalTasksUnavailableReason(reason: string | null): string {
  const raw = reason ?? ''
  if (
    /readonly|read-only|EACCES|EPERM|permission denied|SQLITE_(READONLY|PERM|CANTOPEN)/i.test(raw)
  ) {
    return translate(
      'localTasks.state.reasonPermission',
      'Orca cannot write to the task library file on this computer. Check the permissions of the Orca data folder, then restart Orca.'
    )
  }
  if (/ENOSPC|SQLITE_FULL|disk is full|no space/i.test(raw)) {
    return translate(
      'localTasks.state.reasonDiskFull',
      'The disk is full, so the task library cannot be opened. Free up space, then restart Orca.'
    )
  }
  if (/malformed|not a database|corrupt|SQLITE_(CORRUPT|NOTADB)/i.test(raw)) {
    return translate(
      'localTasks.state.reasonCorrupt',
      'The task library file is damaged, so Orca cannot read it.'
    )
  }
  if (/database is locked|SQLITE_BUSY|SQLITE_LOCKED/i.test(raw)) {
    return translate(
      'localTasks.state.reasonLocked',
      'Another Orca process is holding the task library. Quit it, then restart Orca.'
    )
  }
  return translate(
    'localTasks.state.reasonUnknown',
    'Something on this computer stopped Orca from opening the task library.'
  )
}
