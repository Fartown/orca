import { localTasksChangeFeed } from './local-tasks-change-feed'
import { LocalTasksDatabase } from './local-tasks-database'
import type { LocalTaskHostSessionSource } from './local-task-host-session-source'
import { localTasksReadiness } from './local-tasks-readiness'
import { LocalTasksService } from './local-tasks-service'

export type StartLocalTasksHostOptions = {
  profileId: string
  userDataPath?: string
  /** This process's agent status and terminals; omitted, every session reads `unknown`. */
  sessions?: LocalTaskHostSessionSource
}

/**
 * Opens this profile's task library and makes the process a task host. Synchronous so the
 * library is registered before the RPC server binds and a client's first status read sees it.
 * A library that cannot open leaves the host `unavailable` instead of failing Orca's startup.
 */
export function startLocalTasksHost(options: StartLocalTasksHostOptions): () => void {
  localTasksReadiness.markStarting()
  let database: LocalTasksDatabase
  try {
    database = LocalTasksDatabase.open(options.profileId, options.userDataPath)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.error('[local-tasks] task library failed to open', error)
    localTasksReadiness.setUnavailable(reason)
    return () => {}
  }
  const service = new LocalTasksService(
    database,
    Date.now,
    (scopes) => localTasksChangeFeed.publish(database.revision(), scopes),
    options.sessions
  )
  const stopFeed = database.onCommit((commit) =>
    localTasksChangeFeed.publish(commit.revision, commit.scopes)
  )
  const unregister = localTasksReadiness.register(service)
  try {
    service.execution.start()
  } catch (error) {
    // Why: progress then reads on demand; the library itself stays usable.
    console.error('[local-tasks] watching agent status failed', error)
  }
  return () => {
    unregister()
    stopFeed()
    service.execution.dispose()
    database.close()
  }
}
