import { startLocalTasksHost } from '../local-tasks/local-tasks-host-lifecycle'
import { getCanonicalUserDataPath } from '../persistence'
import { mainProcessState as state } from './main-process-state'

let stopLocalTasks: (() => void) | null = null

/** Only the desktop app hosts a task library; `--serve` (incl. the orcad sidecar) never does. */
export function startLocalTasksForMainProcess(): void {
  if (state.isServeMode) {
    return
  }
  const profile = state.activeOrcaProfile
  if (!profile) {
    throw new Error('Local tasks need the active Orca profile before runtime launch')
  }
  stopLocalTasks?.()
  stopLocalTasks = startLocalTasksHost({
    profileId: profile.profile.id,
    userDataPath: getCanonicalUserDataPath()
  })
}

export function stopLocalTasksForMainProcess(): void {
  stopLocalTasks?.()
  stopLocalTasks = null
}
