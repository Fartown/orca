import { describe, expect, it, vi } from 'vitest'
import type {
  LocalTaskForwardedFact,
  LocalTaskWatch
} from '../../../shared/local-tasks/local-task-dispatcher-types'
import type { LocalTask, LocalTaskEvent } from '../../../shared/local-tasks/local-task-types'

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

function setup(
  watches: LocalTaskWatch[] = [
    { taskId: REMOTE, addedAt: 1_000_000, addedBy: 'proposal' },
    { taskId: 'task-local', addedAt: 1_000_000, addedBy: 'proposal' }
  ],
  tasks: LocalTask[] = []
) {
  const recorded: LocalTaskForwardedFact[][] = []
  const watchEvents = vi.fn(() => () => undefined)
  const watch = vi.fn(async () => ({ ok: true as const }))
  const forwarding = createLocalTaskDispatcherForwarding({
    client: {
      watches: async () => ({ ok: true as const, watches }),
      recordFacts: async (_paneKey, facts) => {
        recorded.push(facts)
        return { ok: true as const }
      },
      watch
    },
    watchEvents,
    paneKey: () => 'tab-d:leaf',
    hostLabel: () => 'loopback sshd',
    now: () => 2_000_000,
    domain: () => ({ tasks, projects: [], links: { workspaces: [], sessions: [] } })
  })
  return { forwarding, recorded, watchEvents, watch }
}

function remoteTask(id: string, ref: string, title: string): LocalTask {
  return {
    id,
    projectId: 'runtime:env-ssh/p',
    number: Number(ref.split('-')[1]),
    ref,
    title,
    description: '',
    criteria: [],
    statusId: 'runtime:env-ssh/todo',
    priority: 0,
    labels: [],
    parentId: null,
    createdAt: 0,
    updatedAt: 0,
    revision: 1
  }
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

  it('follows a ref the dispatcher watched once one library in contact holds it', async () => {
    const pending: LocalTaskWatch = { taskId: 'ref:SSH-7', addedAt: 1, addedBy: 'dispatcher' }
    const tasks: LocalTask[] = []
    const { forwarding, recorded, watch } = setup([pending], tasks)
    await forwarding.refreshWatches()
    expect(watch).not.toHaveBeenCalled()

    tasks.push(remoteTask(REMOTE, 'SSH-7', 'Investigate on SSH'))
    await forwarding.resolvePending()
    // One write follows the task and drops the pending ref; an unwatch by ref would end both.
    expect(watch).toHaveBeenCalledWith('tab-d:leaf', REMOTE, 'ref:SSH-7')
    expect(recorded.flat().map((fact) => [fact.kind, fact.taskId, fact.summary])).toEqual([
      ['host', REMOTE, 'Now following SSH-7 "Investigate on SSH" on loopback sshd']
    ])
    await forwarding.resolvePending()
    expect(watch).toHaveBeenCalledTimes(1)

    // Watched again after an unwatch, the same ref is followed again.
    await forwarding.refreshWatches()
    expect(watch).toHaveBeenCalledTimes(2)
  })

  it('leaves a ref that two hosts hold waiting instead of guessing', async () => {
    const pending: LocalTaskWatch = { taskId: 'ref:SSH-7', addedAt: 1, addedBy: 'dispatcher' }
    const { forwarding, watch } = setup(
      [pending],
      [remoteTask(REMOTE, 'SSH-7', 'One'), remoteTask('runtime:env-other/task-7', 'SSH-7', 'Other')]
    )
    await forwarding.refreshWatches()
    expect(watch).not.toHaveBeenCalled()
  })
})
