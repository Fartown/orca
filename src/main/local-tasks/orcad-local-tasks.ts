import { getAppEnvironment } from '../../shared/app-environment'
import { ensureActiveOrcaProfile } from '../orca-profiles/profile-index-store'
import {
  bindLocalTaskHostSessions,
  type LocalTaskHostRuntime
} from './local-task-host-session-binding'
import { startLocalTasksHost } from './local-tasks-host-lifecycle'

/**
 * orcad keeps its profile's task library like the desktop does (D-008): on an SSH host or WSL that
 * is the remote `~/.orca/profiles/{id}/local-tasks/`. Runs before the RPC server binds.
 */
export function startOrcadLocalTasks(runtime: LocalTaskHostRuntime): () => void {
  const userDataPath = getAppEnvironment().getPath('userData')
  // Why re-read: orcad's profile startup already ensured it, so this only reads the index back.
  const profileId = ensureActiveOrcaProfile(userDataPath).profile.id
  return startLocalTasksHost({
    profileId,
    userDataPath,
    sessions: bindLocalTaskHostSessions(runtime)
  })
}
