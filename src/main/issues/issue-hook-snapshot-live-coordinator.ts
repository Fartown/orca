const MAX_BUFFERED_HOOK_EVENTS = 10_000

export type IssueHookObservedEvent = {
  observedAt: number
}

export type IssueHookSnapshotLiveCoordinatorOptions<
  Snapshot,
  Event extends IssueHookObservedEvent
> = {
  subscribe(listener: (event: Event) => void): () => void
  readSnapshot(): Promise<Snapshot>
  ingestSnapshot(snapshot: Snapshot): Promise<void> | void
  ingestEvent(event: Event): Promise<void> | void
  snapshotEventKeys(snapshot: Snapshot): Iterable<string>
  eventKey(event: Event): string
  onIngestError?(error: unknown, event: Event): void
}

export class IssueHookSnapshotLiveCoordinator<Snapshot, Event extends IssueHookObservedEvent> {
  private readonly buffered: Event[] = []
  private readonly seen = new Set<string>()
  private unsubscribe: (() => void) | null = null
  private seeding = true
  private disposed = false
  private overflowed = false
  private liveChain = Promise.resolve()

  constructor(private readonly options: IssueHookSnapshotLiveCoordinatorOptions<Snapshot, Event>) {}

  async start(): Promise<void> {
    if (this.unsubscribe) {
      throw new Error('Issue hook coordinator already started.')
    }
    this.unsubscribe = this.options.subscribe((event) => this.accept(event))
    try {
      const snapshot = await this.options.readSnapshot()
      for (const key of this.options.snapshotEventKeys(snapshot)) {
        this.seen.add(key)
      }
      await this.options.ingestSnapshot(snapshot)
      while (this.buffered.length > 0) {
        const batch = this.buffered.splice(0).sort(compareObservedEvent)
        for (const event of batch) {
          await this.ingestLiveEvent(event)
        }
      }
      if (this.overflowed) {
        throw new Error('Issue hook snapshot buffer overflowed.')
      }
      this.seeding = false
    } catch (error) {
      this.dispose()
      throw error
    }
  }

  async drain(): Promise<void> {
    await this.liveChain
  }

  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.unsubscribe?.()
    this.unsubscribe = null
    this.buffered.length = 0
  }

  private accept(event: Event): void {
    if (this.disposed) {
      return
    }
    if (this.seeding) {
      if (this.buffered.length >= MAX_BUFFERED_HOOK_EVENTS) {
        this.overflowed = true
        return
      }
      this.buffered.push(event)
      return
    }
    this.liveChain = this.liveChain.then(() => this.ingestLiveEvent(event))
  }

  private async ingestOnce(event: Event): Promise<void> {
    const key = this.options.eventKey(event)
    if (this.seen.has(key)) {
      return
    }
    this.seen.add(key)
    try {
      await this.options.ingestEvent(event)
    } catch (error) {
      this.seen.delete(key)
      throw error
    }
  }

  private async ingestLiveEvent(event: Event): Promise<void> {
    try {
      await this.ingestOnce(event)
    } catch (error) {
      try {
        this.options.onIngestError?.(error, event)
      } catch {
        // Diagnostics must not poison the live ingestion chain.
      }
    }
  }
}

function compareObservedEvent(left: IssueHookObservedEvent, right: IssueHookObservedEvent): number {
  return left.observedAt - right.observedAt
}
