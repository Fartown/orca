import { describe, expect, it, vi } from 'vitest'
import type { LocalTaskForwardedFact } from '../../../shared/local-tasks/local-task-dispatcher-types'
import type { LocalTaskEvent } from '../../../shared/local-tasks/local-task-types'

vi.mock('@/store', async () => {
  const { createTestStore } = await import('@/store/slices/store-test-helpers')
  return { useAppStore: createTestStore() }
})

import { createLocalTaskDispatcherForwarding } from './local-task-dispatcher-forwarding'
import type { ForwardingView } from './local-task-dispatcher-forwarding'

const REMOTE = 'runtime:env-ssh/task-7'

function event(id: string, extra: Partial<LocalTaskEvent>): LocalTaskEvent {
  return {
    id,
    taskId: REMOTE,
    kind: 'comment',
    source: 'cli',
    body: null,
    payload: null,
    createdAt: 1_000_000,
    editedAt: null,
    ...extra
  }
}

function domain(events: LocalTaskEvent[], inContact = true): ForwardingView {
  return {
    tasks: [
      { id: REMOTE, ref: 'SSH-7', title: 'Investigate on SSH', projectId: 'runtime:env-ssh/p' }
    ],
    projects: [
      {
        id: 'runtime:env-ssh/p',
        statuses: [{ id: 'runtime:env-ssh/done', category: 'completed' as const }]
      }
    ],
    eventsByTaskId: { [REMOTE]: events },
    partitions: [{ endpoint: 'runtime:env-ssh', inContact }]
  }
}

function setup() {
  const recorded: LocalTaskForwardedFact[][] = []
  const watchEvents = vi.fn(() => () => undefined)
  const forwarding = createLocalTaskDispatcherForwarding({
    client: {
      watches: async () => ({
        ok: true as const,
        watches: [
          { taskId: REMOTE, addedAt: 1_000_000, addedBy: 'proposal' as const },
          { taskId: 'task-local', addedAt: 1_000_000, addedBy: 'proposal' as const }
        ]
      }),
      recordFacts: async (_paneKey, facts) => {
        recorded.push(facts)
        return { ok: true as const }
      }
    },
    watchEvents,
    paneKey: () => 'tab-d:leaf',
    hostLabel: () => 'loopback sshd',
    now: () => 2_000_000
  })
  return { forwarding, recorded, watchEvents }
}

describe('forwarding news from other libraries to the dispatcher', () => {
  it('reads only tasks on other hosts and forwards each writeback once', async () => {
    const { forwarding, recorded, watchEvents } = setup()
    await forwarding.refreshWatches()
    expect(watchEvents).toHaveBeenCalledWith(REMOTE)
    expect(watchEvents).not.toHaveBeenCalledWith('task-local')

    const events = [
      event('e1', { body: 'Found it', payload: { progress: true, needsYou: 'Pick a timeout' } }),
      event('e2', { body: 'note to self' }),
      event('e3', {
        kind: 'status',
        source: 'desktop',
        payload: { to: 'runtime:env-ssh/done', toName: 'Done' }
      })
    ]
    await forwarding.forward(domain(events))
    await forwarding.forward(domain(events))

    expect(recorded).toHaveLength(1)
    expect(
      recorded[0].map((fact) => [
        fact.kind,
        fact.taskRef,
        fact.needsYou ?? null,
        fact.finished ?? false
      ])
    ).toEqual([
      ['progress', 'SSH-7', 'Pick a timeout', false],
      ['status', 'SSH-7', null, true]
    ])
  })

  it('tells the dispatcher when the host leaves and regains contact', async () => {
    const { forwarding, recorded } = setup()
    await forwarding.refreshWatches()
    await forwarding.forward(domain([], true))
    await forwarding.forward(domain([], false))
    await forwarding.forward(domain([], true))

    expect(recorded.flat().map((fact) => [fact.kind, fact.summary])).toEqual([
      [
        'host',
        "loopback sshd is out of contact: its tasks can't be confirmed (unverifiable) until it is back"
      ],
      ['host', 'loopback sshd is back in contact; news from its tasks resumes']
    ])
  })
})
