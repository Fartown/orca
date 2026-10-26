import { localTasksChangeFeed } from './local-tasks-change-feed'
import { LocalTasksDatabase } from './local-tasks-database'
import { localTasksReadiness } from './local-tasks-readiness'
import { LocalTasksService } from './local-tasks-service'

export type StartLocalTasksHostOptions = { profileId: string; userDataPath?: string }

/**
 * Opens this profile's task library and makes the process a task host. Synchronous so the
 * library is registered before the RPC server binds and a phone's first status read sees it.
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
  const service = new LocalTasksService(database)
  const stopFeed = database.onCommit((commit) =>
    localTasksChangeFeed.publish(commit.revision, commit.scopes)
  )
  const unregister = localTasksReadiness.register(service)
  return () => {
    unregister()
    stopFeed()
    database.close()
  }
}
