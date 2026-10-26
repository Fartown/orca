import type { LocalTaskChangeScope } from '../../shared/local-tasks/local-task-types'

// Why: batch edits commit in bursts; one notice per window bounds how often clients re-read.
const LOCAL_TASKS_CHANGE_COALESCE_MS = 100

export type LocalTasksChangeNotice = { revision: number; scopes: LocalTaskChangeScope[] | null }

export class LocalTasksChangeFeed {
  private readonly listeners = new Set<(notice: LocalTasksChangeNotice) => void>()
  private pending: { revision: number; scopes: Set<LocalTaskChangeScope> | 'all' } | null = null
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly coalesceMs = LOCAL_TASKS_CHANGE_COALESCE_MS) {}

  subscribe(listener: (notice: LocalTasksChangeNotice) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** `null` scopes means every client view must re-read (readiness changes). */
  publish(revision: number, scopes: LocalTaskChangeScope[] | null): void {
    // Why: a subscriber that attaches later resyncs on its ready message.
    if (this.listeners.size === 0) {
      return
    }
    const pending = this.pending ?? { revision, scopes: new Set<LocalTaskChangeScope>() }
    pending.revision = Math.max(pending.revision, revision)
    if (scopes === null) {
      pending.scopes = 'all'
    } else if (pending.scopes !== 'all') {
      for (const scope of scopes) {
        pending.scopes.add(scope)
      }
    }
    this.pending = pending
    this.timer ??= setTimeout(() => this.flush(), this.coalesceMs)
  }

  private flush(): void {
    const pending = this.pending
    this.pending = null
    this.timer = null
    if (!pending) {
      return
    }
    const notice: LocalTasksChangeNotice = {
      revision: pending.revision,
      scopes: pending.scopes === 'all' ? null : [...pending.scopes]
    }
    for (const listener of this.listeners) {
      try {
        listener(notice)
      } catch (error) {
        console.error('[local-tasks] change listener failed', error)
      }
    }
  }
}

export const localTasksChangeFeed = new LocalTasksChangeFeed()
