import { bindLocalTaskHostSessions } from '../local-tasks/local-task-host-session-binding'
import { startLocalTasksHost } from '../local-tasks/local-tasks-host-lifecycle'
import { getCanonicalUserDataPath } from '../persistence'
import { isOrcadSidecarLaunch } from '../window/foreground-activation-policy'
import { mainProcessState as state } from './main-process-state'

let stopLocalTasks: (() => void) | null = null

/**
 * The desktop app and Electron `orca serve` each keep their profile's task library (D-008).
 * orcad's browser sidecar is a `--serve` on a throwaway profile: opening one there would advertise
 * a second, empty library. orcad itself starts its library through `startOrcadForkServices`.
 */
export function startLocalTasksForMainProcess(): void {
  if (isOrcadSidecarLaunch()) {
    return
  }
  const profile = state.activeOrcaProfile
  const runtime = state.runtime
  if (!profile || !runtime) {
    throw new Error('Local tasks need the active Orca profile and runtime before runtime launch')
  }
  stopLocalTasks?.()
  stopLocalTasks = startLocalTasksHost({
    profileId: profile.profile.id,
    userDataPath: getCanonicalUserDataPath(),
    sessions: bindLocalTaskHostSessions(runtime)
  })
}

export function stopLocalTasksForMainProcess(): void {
  stopLocalTasks?.()
  stopLocalTasks = null
}
