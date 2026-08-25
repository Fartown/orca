import { describe, expect, it } from 'vitest'
import { IssueHookSnapshotLiveCoordinator } from './issue-hook-snapshot-live-coordinator'

describe('IssueHookSnapshotLiveCoordinator', () => {
  it('subscribes before snapshot and drains live events once in observation order', async () => {
    let listener: ((event: Event) => void) | null = null
    let finishSnapshot!: (snapshot: Snapshot) => void
    const snapshotPromise = new Promise<Snapshot>((resolve) => {
      finishSnapshot = resolve
    })
    const ingested: string[] = []
    const coordinator = new IssueHookSnapshotLiveCoordinator<Snapshot, Event>({
      subscribe: (next) => {
        listener = next
        return () => {
          listener = null
        }
      },
      readSnapshot: () => snapshotPromise,
      ingestSnapshot: (snapshot) => {
        ingested.push(...snapshot.ids.map((id) => `snapshot:${id}`))
      },
      ingestEvent: (event) => {
        ingested.push(`live:${event.id}`)
      },
      snapshotEventKeys: (snapshot) => snapshot.ids,
      eventKey: (event) => event.id
    })

    const started = coordinator.start()
    listener!({ id: 'live-late', observedAt: 3 })
    listener!({ id: 'in-snapshot', observedAt: 1 })
    listener!({ id: 'live-early', observedAt: 2 })
    finishSnapshot({ ids: ['in-snapshot'] })
    await started
    listener!({ id: 'after-seed', observedAt: 4 })
    await coordinator.drain()

    expect(ingested).toEqual([
      'snapshot:in-snapshot',
      'live:live-early',
      'live:live-late',
      'live:after-seed'
    ])
    coordinator.dispose()
    expect(listener).toBeNull()
  })

  it('continues after one live ingest failure and permits a later retry of that event', async () => {
    let listener: ((event: Event) => void) | null = null
    let failBadEvent = true
    const ingested: string[] = []
    const errors: string[] = []
    const coordinator = new IssueHookSnapshotLiveCoordinator<Snapshot, Event>({
      subscribe: (next) => {
        listener = next
        return () => {
          listener = null
        }
      },
      readSnapshot: async () => ({ ids: [] }),
      ingestSnapshot: () => undefined,
      ingestEvent: (event) => {
        if (event.id === 'bad' && failBadEvent) {
          failBadEvent = false
          throw new Error('injected ingest failure')
        }
        ingested.push(event.id)
      },
      snapshotEventKeys: (snapshot) => snapshot.ids,
      eventKey: (event) => event.id,
      onIngestError: (error, event) => {
        errors.push(`${event.id}:${error instanceof Error ? error.message : String(error)}`)
      }
    })
    await coordinator.start()

    listener!({ id: 'bad', observedAt: 1 })
    listener!({ id: 'good', observedAt: 2 })
    await coordinator.drain()
    expect(ingested).toEqual(['good'])
    expect(errors).toEqual(['bad:injected ingest failure'])

    listener!({ id: 'bad', observedAt: 3 })
    await coordinator.drain()
    expect(ingested).toEqual(['good', 'bad'])
    coordinator.dispose()
  })
})

type Snapshot = { ids: string[] }
type Event = { id: string; observedAt: number }
