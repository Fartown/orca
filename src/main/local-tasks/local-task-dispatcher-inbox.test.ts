import { describe, expect, it } from 'vitest'
// Why a value import: the Bun runner only moves SQLite tests to Node when they import this directly.
import SyncDatabase from '../sqlite/sync-database'
import { decodeInboxCursor, encodeInboxCursor } from './local-task-dispatcher-inbox'
import { LocalTasksDatabase } from './local-tasks-database'
import { LocalTasksService } from './local-tasks-service'

void SyncDatabase

let opId = 0
const op = (): string => `op-${++opId}`
const PANE = 'tab-d:pane-d'
const CONN_A = 'desktop-renderer:1:1'
const CONN_B = 'desktop-renderer:2:1'

function claimLifetime() {
  const claims = new Map<string, { connectionId?: string; cleanup: () => void }>()
  return {
    registerSubscriptionCleanup(id: string, cleanup: () => void, connectionId?: string) {
      claims.set(id, { connectionId, cleanup })
    },
    cleanupSubscription(id: string) {
      const claim = claims.get(id)
      claims.delete(id)
      claim?.cleanup()
    }
  }
}

function setup() {
  const db = LocalTasksDatabase.openTransient()
  let clock = 1_000
  const service = new LocalTasksService(db, () => ++clock)
  const created = service.createProject({
    clientOperationId: op(),
    name: 'Shop',
    prefix: 'shop',
    repos: []
  })
  if (!created.ok) {
    throw new Error(created.code)
  }
  const registered = service.registerDispatcher({ clientOperationId: op(), paneKey: PANE })
  if (!registered.ok) {
    throw new Error(registered.code)
  }
  const task = (title: string) => {
    const result = service.createTask(
      { clientOperationId: op(), projectId: created.project.id, title },
      'desktop'
    )
    if (!result.ok) {
      throw new Error(result.code)
    }
    return result.task
  }
  const inbox = () => {
    const result = service.dispatcher.inbox(PANE)
    if (!result.ok) {
      throw new Error(result.code)
    }
    return result.inbox
  }
  const ack = (cursor: string) =>
    service.ackInbox({ clientOperationId: op(), paneKey: PANE, cursor })
  const propose = (titles: string[]) => {
    const result = service.createProposal({
      clientOperationId: op(),
      paneKey: PANE,
      summary: 'Follow up',
      items: titles.map((title) => ({
        kind: 'start' as const,
        title,
        prompt: 'Read only',
        target: { worktreeId: `wt-${title}` }
      }))
    })
    if (!result.ok) {
      throw new Error(result.code)
    }
    return result.proposal
  }
  return { service, task, inbox, ack, propose }
}

describe('acking the dispatcher inbox', () => {
  it('refuses a cursor naming a position no inbox read handed out, and keeps the news', () => {
    const { service, task, inbox, ack } = setup()
    const watched = task('Fix reconnect')
    service.watchTask({ clientOperationId: op(), paneKey: PANE, taskId: watched.id })
    const issued = decodeInboxCursor(inbox().cursor)
    if (!issued) {
      throw new Error('cursor')
    }
    const future = encodeInboxCursor({
      ...issued,
      eventAt: issued.eventAt + 86_400_000,
      eventRowid: 1e9
    })
    expect(ack(future)).toMatchObject({ ok: false, code: 'invalid_argument', detail: 'cursor' })
    const unknownFact = encodeInboxCursor({ ...issued, factRowid: 999 })
    expect(ack(unknownFact)).toMatchObject({ ok: false, detail: 'cursor' })

    service.addComment(
      { clientOperationId: op(), taskId: watched.id, body: 'Found it', progress: {} },
      'cli'
    )
    expect(inbox().items.map((item) => item.kind)).toEqual(['progress'])
    expect(ack(inbox().cursor).ok).toBe(true)
    expect(inbox().items).toEqual([])
  })

  it('never marks a proposal still waiting on the user as reported', () => {
    const { service, inbox, ack, propose } = setup()
    const proposal = propose(['A'])
    const issued = decodeInboxCursor(inbox().cursor)
    if (!issued) {
      throw new Error('cursor')
    }
    expect(ack(encodeInboxCursor({ ...issued, proposals: [proposal.id] })).ok).toBe(true)
    service.decideProposal(
      { clientOperationId: op(), proposalId: proposal.id, decision: 'dismissed' },
      'desktop'
    )
    expect(inbox().items.map((item) => item.summary)).toEqual([
      'The user dismissed your proposal: Follow up'
    ])
  })
})

describe('telling the dispatcher how a confirmed proposal went (D-018)', () => {
  it('names every kept item without a result as unknown after an interrupted run', () => {
    const { service, inbox, propose } = setup()
    const lifetime = claimLifetime()
    const proposal = propose(['A', 'B', 'C', 'D'])
    service.decideProposal(
      {
        clientOperationId: op(),
        proposalId: proposal.id,
        decision: 'confirmed',
        keepItemIndexes: [0, 1, 2]
      },
      'desktop'
    )
    service.claimProposal({ clientOperationId: op(), proposalId: proposal.id }, CONN_A, lifetime)
    service.recordProposalResults(
      {
        clientOperationId: op(),
        proposalId: proposal.id,
        finalize: false,
        results: [{ index: 0, ok: true, detail: 'started SHOP-1' }]
      },
      CONN_A,
      lifetime
    )
    expect(
      service.releaseProposal(
        { clientOperationId: op(), proposalId: proposal.id },
        CONN_A,
        lifetime
      )
    ).toMatchObject({ ok: true, proposal: { executionActive: false } })
    service.recordProposalResults(
      { clientOperationId: op(), proposalId: proposal.id, results: [] },
      CONN_B,
      lifetime
    )
    expect(inbox().items.map((item) => item.summary)).toEqual([
      'The user confirmed your proposal (Follow up): item 1 done (started SHOP-1); item(s) 2, 3: the run was interrupted, their state is unknown; check the tasks before deciding whether to propose them again; item(s) 4 left out by the user'
    ])
  })
})

describe('releasing a run its window can no longer report on', () => {
  it('lets only the claiming connection give it up, and never lets it run again', () => {
    const { service, propose } = setup()
    const lifetime = claimLifetime()
    const proposal = propose(['A'])
    service.decideProposal(
      { clientOperationId: op(), proposalId: proposal.id, decision: 'confirmed' },
      'desktop'
    )
    const claim = { clientOperationId: op(), proposalId: proposal.id }
    service.claimProposal(claim, CONN_A, lifetime)
    expect(service.releaseProposal(claim, CONN_B, lifetime)).toMatchObject({
      ok: false,
      code: 'stale'
    })
    expect(service.releaseProposal(claim, CONN_A, lifetime)).toMatchObject({
      ok: true,
      proposal: { status: 'executing', executionActive: false }
    })
    expect(service.claimProposal(claim, CONN_A, lifetime)).toMatchObject({
      ok: false,
      code: 'stale'
    })
  })
})

describe('following a task by ref on another host (REQ-031)', () => {
  it('keeps a ref this library does not hold for a desktop window to find', () => {
    const { service, inbox } = setup()
    expect(
      service.watchTask({ clientOperationId: op(), paneKey: PANE, taskId: 'ref:SSH-7' })
    ).toMatchObject({ ok: true })
    expect(service.dispatcher.watches(PANE)).toMatchObject({
      ok: true,
      watches: [{ taskId: 'ref:SSH-7', addedBy: 'dispatcher' }]
    })
    expect(inbox().watchedTaskCount).toBe(1)
  })

  it('swaps a resolved ref for the task in one write, keeping the watch its report names', () => {
    const { service } = setup()
    const remote = 'runtime:env-ssh/task-7'
    const followed = {
      sourceId: `${remote}#followed#ref:SSH-7`,
      kind: 'host' as const,
      at: 5,
      taskId: remote,
      taskRef: 'SSH-7',
      summary: 'Now following SSH-7'
    }
    for (const round of [1, 2]) {
      service.watchTask({ clientOperationId: op(), paneKey: PANE, taskId: 'ref:SSH-7' })
      expect(
        service.watchTask({
          clientOperationId: op(),
          paneKey: PANE,
          taskId: remote,
          replacesRef: 'ref:SSH-7'
        })
      ).toMatchObject({ ok: true })
      service.recordDispatcherFacts({
        clientOperationId: op(),
        paneKey: PANE,
        facts: [{ ...followed, sourceId: `${followed.sourceId}#${round}` }]
      })
      expect(service.dispatcher.watches(PANE)).toMatchObject({
        ok: true,
        watches: [{ taskId: remote }]
      })
    }
  })

  it('stops following by the ref its inbox reported, and says when it followed nothing', () => {
    const { service, inbox } = setup()
    const remote = 'runtime:env-ssh/task-7'
    service.watchTask({ clientOperationId: op(), paneKey: PANE, taskId: remote })
    service.recordDispatcherFacts({
      clientOperationId: op(),
      paneKey: PANE,
      facts: [
        {
          sourceId: `${remote}#followed`,
          kind: 'host',
          at: 5,
          taskId: remote,
          taskRef: 'SSH-7',
          summary: 'Now following SSH-7'
        }
      ]
    })
    expect(
      service.unwatchTask({ clientOperationId: op(), paneKey: PANE, taskId: 'ref:SSH-7' })
    ).toMatchObject({ ok: true })
    expect(inbox().watchedTaskCount).toBe(0)
    expect(
      service.unwatchTask({ clientOperationId: op(), paneKey: PANE, taskId: 'ref:SSH-8' })
    ).toMatchObject({ ok: false, code: 'not_found', detail: 'watch' })
  })
})
