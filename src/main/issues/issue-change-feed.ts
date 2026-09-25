import type { AuthorityHostPartitionKey } from '../../shared/issues/types'

// Hook evidence and title writes arrive in bursts; one notice per window bounds client re-reads.
const ISSUE_CHANGE_COALESCE_MS = 250

export type IssueChangeNotice = {
  hostPartitionKeys: AuthorityHostPartitionKey[] | null
}

export class IssueChangeFeed {
  private readonly listeners = new Set<(notice: IssueChangeNotice) => void>()
  private pending: Set<AuthorityHostPartitionKey> | 'all' | null = null
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly coalesceMs = ISSUE_CHANGE_COALESCE_MS) {}

  subscribe(listener: (notice: IssueChangeNotice) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** `null` marks a change every partition projects (runtime attachments, readiness). */
  publish(hostPartitionKey: AuthorityHostPartitionKey | null): void {
    // A subscriber that attaches later resyncs on its ready message.
    if (this.listeners.size === 0) {
      return
    }
    if (hostPartitionKey === null) {
      this.pending = 'all'
    } else if (this.pending !== 'all') {
      this.pending ??= new Set()
      this.pending.add(hostPartitionKey)
    }
    this.timer ??= setTimeout(() => this.flush(), this.coalesceMs)
  }

  private flush(): void {
    const pending = this.pending
    this.pending = null
    this.timer = null
    if (!pending) {
      return
    }
    const notice: IssueChangeNotice = {
      hostPartitionKeys: pending === 'all' ? null : [...pending]
    }
    for (const listener of this.listeners) {
      try {
        listener(notice)
      } catch (error) {
        console.error('[issues] change listener failed', error)
      }
    }
  }
}

export const issueChangeFeed = new IssueChangeFeed()
