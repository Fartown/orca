import type {
  LocalTasksHostState,
  LocalTasksStatus
} from '../../shared/local-tasks/local-task-types'
import type { LocalTasksService } from './local-tasks-service'

export class LocalTasksUnavailableError extends Error {
  constructor(readonly state: LocalTasksHostState) {
    super(
      state === 'not-task-host'
        ? 'This Orca does not host a task library.'
        : 'The task library is not available.'
    )
    this.name = 'LocalTasksUnavailableError'
  }
}

/**
 * One per process. Every Orca that keeps a profile registers its library: the desktop app,
 * `orca serve` and orcad (D-008). Only orcad's browser sidecar never does, so it stays
 * `not-task-host` although the shared RPC registry lists the `localTasks.*` methods there too.
 */
export class LocalTasksReadinessRegistry {
  private service: LocalTasksService | null = null
  private state: LocalTasksHostState = 'not-task-host'
  private reason: string | null = null
  private readonly listeners = new Set<() => void>()

  markStarting(): void {
    this.set(null, 'starting', null)
  }

  register(service: LocalTasksService): () => void {
    this.set(service, service.readOnly ? 'read-only' : 'ready', null)
    return () => {
      if (this.service === service) {
        this.set(null, 'not-task-host', null)
      }
    }
  }

  setUnavailable(reason: string): void {
    this.set(null, 'unavailable', reason)
  }

  status(): LocalTasksStatus {
    return {
      taskHost: this.state !== 'not-task-host',
      state: this.state,
      reason: this.reason,
      revision: this.service?.revision() ?? 0,
      taskHostId: this.service?.taskHostId() ?? null,
      inProgressCount: this.service?.inProgressCount()
    }
  }

  hostState(): LocalTasksHostState {
    return this.state
  }

  isTaskHost(): boolean {
    return this.state !== 'not-task-host'
  }

  requireService(): LocalTasksService {
    if (!this.service) {
      throw new LocalTasksUnavailableError(this.state)
    }
    return this.service
  }

  /** Resolves once startup settles, so a stream never sends `ready` while the library is opening. */
  whenSettled(signal?: AbortSignal): Promise<void> {
    if (this.state !== 'starting') {
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      const done = (): void => {
        this.listeners.delete(onChange)
        signal?.removeEventListener('abort', done)
        resolve()
      }
      const onChange = (): void => {
        if (this.state !== 'starting') {
          done()
        }
      }
      this.listeners.add(onChange)
      signal?.addEventListener('abort', done, { once: true })
    })
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private set(
    service: LocalTasksService | null,
    state: LocalTasksHostState,
    reason: string | null
  ): void {
    this.service = service
    this.state = state
    this.reason = reason
    for (const listener of this.listeners) {
      listener()
    }
  }
}

export const localTasksReadiness = new LocalTasksReadinessRegistry()
