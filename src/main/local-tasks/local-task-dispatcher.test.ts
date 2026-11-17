import { describe, expect, it } from 'vitest'
// Why a value import: the Bun runner only moves SQLite tests to Node when they import this directly.
import type { LocalTaskForwardedFact } from '../../shared/local-tasks/local-task-dispatcher-types'
import SyncDatabase from '../sqlite/sync-database'
import type { LocalTaskProgressSnapshot } from '../../shared/local-tasks/local-task-link-types'
import type { LocalTasksEventsAddCommentInput } from '../../shared/local-tasks/local-tasks-rpc-params'
import { LocalTaskDispatcher } from './local-task-dispatcher'
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
    },
    close(connectionId: string) {
      for (const [id, claim] of claims) {
        if (claim.connectionId === connectionId) {
          this.cleanupSubscription(id)
        }
      }
    },
    size() {
      return claims.size
    }
  }
}

function setup() {
  const db = LocalTasksDatabase.openTransient()
  let clock = 1_000
  const now = () => ++clock
  const service = new LocalTasksService(db, now)
  const created = service.createProject({
    clientOperationId: op(),
    name: 'Shop',
    prefix: 'shop',
    repos: []
  })
  if (!created.ok) {
    throw new Error(created.code)
  }
  const project = created.project
  const task = (title: string) => {
    const result = service.createTask(
      { clientOperationId: op(), projectId: project.id, title },
      'desktop'
    )
    if (!result.ok) {
      throw new Error(result.code)
    }
    return result.task
  }
  const status = (category: string) => {
    const found = project.statuses.find((candidate) => candidate.category === category)
    if (!found) {
      throw new Error(category)
    }
    return found.id
  }
  return { db, service, project, task, status, now }
}

function register(service: LocalTasksService) {
  const result = service.registerDispatcher({
    clientOperationId: op(),
    paneKey: PANE,
    agent: 'claude'
  })
  if (!result.ok) {
    throw new Error(result.code)
  }
  return result.conversation
}

function propose(service: LocalTasksService, title = 'Investigate retries') {
  const result = service.createProposal({
    clientOperationId: op(),
    paneKey: PANE,
    summary: title,
    items: [
      { kind: 'start', title, prompt: 'Read only', target: { worktreeId: 'wt-1' } },
      { kind: 'start', title: `${title} (2)`, prompt: 'Read only', target: { repoId: 'repo-1' } }
    ]
  })
  if (!result.ok) {
    throw new Error(result.code)
  }
  return result.proposal
}

function inbox(service: LocalTasksService) {
  const result = service.dispatcher.inbox(PANE)
  if (!result.ok) {
    throw new Error(result.code)
  }
  return result.inbox
}

describe('dispatcher conversation and proposals (REQ-030)', () => {
  it('keeps one conversation per dispatcher pane and starts its inbox at registration', () => {
    const { service, task } = setup()
    const before = task('Earlier work')
    service.dispatcher.watch(PANE, before.id, 1)
    const first = register(service)
    expect(register(service).id).toBe(first.id)
    service.addComment(
      { clientOperationId: op(), taskId: before.id, body: 'old', progress: {} },
      'cli'
    )
    expect(inbox(service).items).toEqual([])
  })

  it('carries the conversation, its watches and inbox over to a reopened dispatcher pane', () => {
    const { service, task } = setup()
    const first = register(service)
    const watched = task('Keep following')
    service.watchTask({ clientOperationId: op(), paneKey: PANE, taskId: watched.id })
    const moved = service.registerDispatcher({
      clientOperationId: op(),
      paneKey: 'tab-e:pane-e',
      agent: 'codex',
      previousPaneKey: PANE
    })
    expect(moved).toMatchObject({ ok: true, conversation: { id: first.id, agent: 'codex' } })
    expect(service.dispatcher.inbox(PANE)).toMatchObject({ ok: false })
    const box = service.dispatcher.inbox('tab-e:pane-e')
    expect(box.ok && box.inbox.watchedTaskCount).toBe(1)
  })

  it('refuses proposals and inbox reads from a pane that is not the dispatcher', () => {
    const { service } = setup()
    expect(
      service.createProposal({
        clientOperationId: op(),
        paneKey: 'someone-else',
        items: [{ kind: 'append', taskId: 't', sessionLinkId: 's', text: 'go on' }]
      })
    ).toMatchObject({ ok: false, code: 'not_found', detail: 'dispatcher' })
    expect(service.dispatcher.inbox('someone-else')).toMatchObject({ ok: false })
  })

  it('lets only a person decide, once, and keeps the items they kept', () => {
    const { service } = setup()
    register(service)
    const proposal = propose(service)
    const decide = (source: 'cli' | 'desktop', keep?: number[]) =>
      service.decideProposal(
        {
          clientOperationId: op(),
          proposalId: proposal.id,
          decision: 'confirmed',
          ...(keep ? { keepItemIndexes: keep } : {})
        },
        source
      )
    expect(decide('cli')).toEqual({ ok: false, code: 'desktop_only' })
    expect(decide('desktop', [5])).toMatchObject({ ok: false, code: 'invalid_argument' })
    expect(decide('desktop', [1])).toMatchObject({
      ok: true,
      proposal: { status: 'confirmed', keptItemIndexes: [1], decidedSource: 'desktop' }
    })
    expect(decide('desktop')).toMatchObject({ ok: false, code: 'stale' })
  })

  it('watches what an executed proposal started and tells the dispatcher how it went', () => {
    const { service, task } = setup()
    const lifetime = claimLifetime()
    register(service)
    const proposal = propose(service)
    service.decideProposal(
      { clientOperationId: op(), proposalId: proposal.id, decision: 'confirmed' },
      'desktop'
    )
    const started = task('Investigate retries')
    const unclaimed = service.recordProposalResults(
      {
        clientOperationId: op(),
        proposalId: proposal.id,
        results: []
      },
      CONN_A,
      lifetime
    )
    expect(unclaimed).toMatchObject({ ok: false, code: 'stale' })
    expect(
      service.claimProposal({ clientOperationId: op(), proposalId: proposal.id }, CONN_A, lifetime)
    ).toMatchObject({ ok: true, proposal: { status: 'executing', executionActive: true } })
    // A second window, a stale card or a reload cannot take it again.
    expect(
      service.claimProposal({ clientOperationId: op(), proposalId: proposal.id }, CONN_B, lifetime)
    ).toMatchObject({ ok: false, code: 'stale' })
    const recorded = service.recordProposalResults(
      {
        clientOperationId: op(),
        proposalId: proposal.id,
        results: [
          { index: 0, ok: true, taskId: started.id },
          { index: 1, ok: false, detail: 'host out of contact' }
        ]
      },
      CONN_A,
      lifetime
    )
    expect(recorded).toMatchObject({ ok: true, proposal: { status: 'executed' } })
    expect(service.dispatcher.watches(PANE)).toEqual({
      ok: true,
      watches: [{ taskId: started.id, addedAt: expect.any(Number), addedBy: 'proposal' }]
    })
    const box = inbox(service)
    expect(box.watchedTaskCount).toBe(1)
    expect(box.items.map((item) => item.summary)).toEqual([
      'The user confirmed your proposal (Investigate retries): item 1 done; item 2 failed (host out of contact)'
    ])
    expect(
      service.ackInbox({ clientOperationId: op(), paneKey: PANE, cursor: box.cursor }).ok
    ).toBe(true)
    expect(inbox(service).items).toEqual([])
  })
})

describe('dispatcher inbox (REQ-031)', () => {
  it('reports writebacks, review and user notes on watched tasks only, then moves past them', () => {
    const { service, task, status } = setup()
    register(service)
    const watched = task('Fix reconnect')
    const other = task('Unrelated')
    service.watchTask({ clientOperationId: op(), paneKey: PANE, taskId: watched.id })
    const write = (
      taskId: string,
      body: string,
      progress?: LocalTasksEventsAddCommentInput['progress'],
      source = 'cli' as const
    ) =>
      service.addComment(
        { clientOperationId: op(), taskId, body, ...(progress ? { progress } : {}) },
        source
      )
    write(watched.id, 'Found the loop', { needsYou: 'Pick a timeout' })
    write(watched.id, 'agent chatter')
    write(other.id, 'not mine', {})
    service.addComment(
      { clientOperationId: op(), taskId: watched.id, body: 'Prefer 30s' },
      'desktop'
    )
    service.updateTask(
      { clientOperationId: op(), taskId: watched.id, patch: { statusId: status('review') } },
      'cli'
    )

    const box = inbox(service)
    expect(box.items.map((item) => [item.kind, item.taskRef, item.summary])).toEqual([
      ['progress', 'SHOP-1', '"Fix reconnect": "Found the loop"'],
      ['comment', 'SHOP-1', '"Fix reconnect": "Prefer 30s"'],
      [
        'status',
        'SHOP-1',
        '"Fix reconnect" moved to "Ready for acceptance" — waiting for the user to review'
      ]
    ])
    expect(box.items[0].needsYou).toBe('Pick a timeout')

    service.ackInbox({ clientOperationId: op(), paneKey: PANE, cursor: box.cursor })
    expect(inbox(service).items).toEqual([])
    write(watched.id, 'Repro written', {})
    expect(inbox(service).items.map((item) => item.summary)).toEqual([
      '"Fix reconnect": "Repro written"'
    ])
  })

  it('pages with more and a cursor that covers only what it returned', () => {
    const { service, task } = setup()
    register(service)
    const watched = task('Long task')
    service.watchTask({ clientOperationId: op(), paneKey: PANE, taskId: watched.id })
    for (const body of ['one', 'two', 'three']) {
      service.addComment({ clientOperationId: op(), taskId: watched.id, body, progress: {} }, 'cli')
    }
    const first = service.dispatcher.inbox(PANE, 2)
    if (!first.ok) {
      throw new Error(first.code)
    }
    expect(first.inbox.more).toBe(true)
    expect(first.inbox.items).toHaveLength(2)
    service.ackInbox({ clientOperationId: op(), paneKey: PANE, cursor: first.inbox.cursor })
    expect(inbox(service).items.map((item) => item.summary)).toEqual(['"Long task": "three"'])
  })

  it('stops watching a task once it is completed', () => {
    const { service, task, status } = setup()
    register(service)
    const watched = task('Ship it')
    service.watchTask({ clientOperationId: op(), paneKey: PANE, taskId: watched.id })
    service.updateTask(
      { clientOperationId: op(), taskId: watched.id, patch: { statusId: status('completed') } },
      'desktop'
    )
    const box = inbox(service)
    expect(box.items.map((item) => item.kind)).toEqual(['status'])
    service.ackInbox({ clientOperationId: op(), paneKey: PANE, cursor: box.cursor })
    expect(inbox(service).watchedTaskCount).toBe(0)
  })

  it('keeps following a finished task until the dispatcher has seen what came after its page', () => {
    const { service, task, status } = setup()
    register(service)
    const watched = task('Ship it')
    service.watchTask({ clientOperationId: op(), paneKey: PANE, taskId: watched.id })
    service.addComment(
      { clientOperationId: op(), taskId: watched.id, body: 'one', progress: {} },
      'cli'
    )
    service.addComment(
      { clientOperationId: op(), taskId: watched.id, body: 'two', progress: {} },
      'cli'
    )
    service.updateTask(
      { clientOperationId: op(), taskId: watched.id, patch: { statusId: status('completed') } },
      'desktop'
    )
    const first = service.dispatcher.inbox(PANE, 1)
    if (!first.ok) {
      throw new Error('inbox refused')
    }
    expect(first.inbox.more).toBe(true)
    service.ackInbox({ clientOperationId: op(), paneKey: PANE, cursor: first.inbox.cursor })
    expect(inbox(service).items.map((item) => item.kind)).toEqual(['progress', 'status'])
  })
})

describe('dispatcher proposal decisions', () => {
  it('keeps an active claim exclusive and checkpoints each kept item before owner completion', () => {
    const { service } = setup()
    const lifetime = claimLifetime()
    register(service)
    const proposal = propose(service)
    service.decideProposal(
      { clientOperationId: op(), proposalId: proposal.id, decision: 'confirmed' },
      'desktop'
    )
    const claim = { clientOperationId: op(), proposalId: proposal.id }
    expect(service.claimProposal(claim, CONN_A, lifetime)).toMatchObject({
      ok: true,
      proposal: { executionActive: true }
    })
    expect(lifetime.size()).toBe(1)
    expect(service.claimProposal(claim, CONN_B, lifetime)).toMatchObject({
      ok: false,
      code: 'stale'
    })
    expect(lifetime.size()).toBe(1)
    expect(
      service.recordProposalResults(
        { clientOperationId: op(), proposalId: proposal.id, results: [] },
        CONN_B,
        lifetime
      )
    ).toMatchObject({ ok: false, code: 'stale' })
    const first = {
      clientOperationId: op(),
      proposalId: proposal.id,
      finalize: false,
      results: [{ index: 0, ok: true }]
    }
    expect(service.recordProposalResults(first, CONN_A, lifetime)).toMatchObject({
      ok: true,
      proposal: { status: 'executing', executionActive: true, results: first.results }
    })
    expect(service.recordProposalResults(first, CONN_A, lifetime)).toMatchObject({
      ok: true,
      proposal: { results: first.results }
    })
    expect(
      service.recordProposalResults(
        { clientOperationId: op(), proposalId: proposal.id, results: [] },
        CONN_A,
        lifetime
      )
    ).toMatchObject({ ok: false, code: 'invalid_argument', detail: 'incomplete-results' })
    expect(
      service.recordProposalResults(
        {
          clientOperationId: op(),
          proposalId: proposal.id,
          finalize: false,
          results: [{ index: 0, ok: false }]
        },
        CONN_A,
        lifetime
      )
    ).toMatchObject({ ok: false, code: 'stale', detail: 'result-conflict' })
    expect(
      service.recordProposalResults(
        {
          clientOperationId: op(),
          proposalId: proposal.id,
          finalize: false,
          results: [{ index: 1, ok: false }]
        },
        CONN_A,
        lifetime
      )
    ).toMatchObject({
      ok: true,
      proposal: { status: 'executing', results: [{ index: 0 }, { index: 1 }] }
    })
    expect(
      service.recordProposalResults(
        { clientOperationId: op(), proposalId: proposal.id, results: [] },
        CONN_A,
        lifetime
      )
    ).toMatchObject({
      ok: true,
      proposal: { status: 'executed', results: [{ index: 0 }, { index: 1 }] }
    })
    expect(lifetime.size()).toBe(0)
  })

  it.each([
    ['desktop document reload', CONN_A],
    ['paired desktop socket close', 'paired-desktop-socket:1']
  ])('retires %s and lets another window seal known results', (_event, ownerConnection) => {
    const { service } = setup()
    const lifetime = claimLifetime()
    register(service)
    const proposal = propose(service)
    service.decideProposal(
      { clientOperationId: op(), proposalId: proposal.id, decision: 'confirmed' },
      'desktop'
    )
    const claim = { clientOperationId: op(), proposalId: proposal.id }
    service.claimProposal(claim, ownerConnection, lifetime)
    const checkpoint = {
      clientOperationId: op(),
      proposalId: proposal.id,
      finalize: false,
      results: [{ index: 0, ok: true }]
    }
    service.recordProposalResults(checkpoint, ownerConnection, lifetime)
    lifetime.close(ownerConnection)
    expect(service.dispatcher.listProposals({ status: 'executing' }).proposals[0]).toMatchObject({
      executionActive: false,
      results: checkpoint.results
    })
    expect(service.claimProposal(claim, ownerConnection, lifetime)).toMatchObject({
      ok: false,
      code: 'stale'
    })
    expect(service.recordProposalResults(checkpoint, ownerConnection, lifetime)).toMatchObject({
      ok: false,
      code: 'stale'
    })
    expect(
      service.recordProposalResults(
        { clientOperationId: op(), proposalId: proposal.id, results: [{ index: 1, ok: true }] },
        CONN_B,
        lifetime
      )
    ).toMatchObject({ ok: false, code: 'stale' })
    expect(
      service.recordProposalResults(
        { clientOperationId: op(), proposalId: proposal.id, results: [] },
        CONN_B,
        lifetime
      )
    ).toMatchObject({ ok: true, proposal: { status: 'executed', results: checkpoint.results } })
  })

  it('does not revive an executing claim when the server service restarts', () => {
    const { db, service, now } = setup()
    const lifetime = claimLifetime()
    register(service)
    const proposal = propose(service)
    service.decideProposal(
      { clientOperationId: op(), proposalId: proposal.id, decision: 'confirmed' },
      'desktop'
    )
    service.claimProposal({ clientOperationId: op(), proposalId: proposal.id }, CONN_A, lifetime)
    const checkpoint = {
      clientOperationId: op(),
      proposalId: proposal.id,
      finalize: false,
      results: [{ index: 0, ok: true }]
    }
    service.recordProposalResults(checkpoint, CONN_A, lifetime)
    const restarted = new LocalTasksService(db, now)
    expect(restarted.dispatcher.listProposals({ status: 'executing' }).proposals[0]).toMatchObject({
      executionActive: false,
      results: checkpoint.results
    })
    expect(restarted.recordProposalResults(checkpoint, CONN_A, claimLifetime())).toMatchObject({
      ok: false,
      code: 'stale'
    })
    expect(
      restarted.recordProposalResults(
        { clientOperationId: op(), proposalId: proposal.id, results: [] },
        CONN_B,
        claimLifetime()
      )
    ).toMatchObject({ ok: true, proposal: { status: 'executed', results: checkpoint.results } })
  })

  it('runs a repeated kept item once and follows a task whose session did not start', () => {
    const { service, task } = setup()
    const lifetime = claimLifetime()
    register(service)
    const proposal = propose(service)
    const decided = service.decideProposal(
      {
        clientOperationId: op(),
        proposalId: proposal.id,
        decision: 'confirmed',
        keepItemIndexes: [1, 0, 0]
      },
      'desktop'
    )
    expect(decided).toMatchObject({ ok: true, proposal: { keptItemIndexes: [0, 1] } })
    service.claimProposal({ clientOperationId: op(), proposalId: proposal.id }, CONN_A, lifetime)
    const created = task('Investigate retries')
    service.recordProposalResults(
      {
        clientOperationId: op(),
        proposalId: proposal.id,
        finalize: false,
        results: [{ index: 0, ok: false, taskId: created.id, detail: 'created; start it' }]
      },
      CONN_A,
      lifetime
    )
    expect(inbox(service).watchedTaskCount).toBe(1)
  })

  it('reports a session waiting for the user once, until it is judged again', () => {
    const { db, service, task } = setup()
    register(service)
    const watched = task('Needs approval')
    service.watchTask({ clientOperationId: op(), paneKey: PANE, taskId: watched.id })
    let snapshot: LocalTaskProgressSnapshot = {
      observedAt: 1,
      sessions: [],
      items: [
        {
          key: 'tab-1:a@5',
          taskId: watched.id,
          taskSessionId: 's1',
          kind: 'approval',
          agent: 'codex',
          lastMessage: 'Allow npm install?',
          since: 5,
          replyable: false
        }
      ]
    }
    const dispatcher = new LocalTaskDispatcher(
      db,
      () => snapshot,
      () => (key) => snapshot.items.some((item) => item.key === key)
    )
    const first = dispatcher.inbox(PANE)
    if (!first.ok) {
      throw new Error(first.code)
    }
    expect(first.inbox.items.map((item) => item.summary)).toEqual([
      '"Needs approval": codex waits for the user to approve — "Allow npm install?"'
    ])
    expect(dispatcher.ack(PANE, first.inbox.cursor, 10).ok).toBe(true)
    const again = dispatcher.inbox(PANE)
    expect(again.ok && again.inbox.items).toEqual([])
    snapshot = { ...snapshot, items: [{ ...snapshot.items[0], key: 'tab-1:a@9', since: 9 }] }
    const next = dispatcher.inbox(PANE)
    expect(next.ok && next.inbox.items.map((item) => item.kind)).toEqual(['needs-you'])
  })

  it('refuses a cursor it did not issue', () => {
    const { service } = setup()
    register(service)
    expect(
      service.ackInbox({ clientOperationId: op(), paneKey: PANE, cursor: 'not-a-cursor' })
    ).toMatchObject({ ok: false, code: 'invalid_argument' })
  })
})

describe('dispatcher following tasks in other libraries (D-008)', () => {
  const REMOTE = 'runtime:env-ssh/task-7'

  function fact(sourceId: string, extra: Partial<LocalTaskForwardedFact> = {}) {
    return {
      sourceId,
      kind: 'progress' as const,
      at: 50,
      taskId: REMOTE,
      taskRef: 'SSH-7',
      summary: 'Investigate on SSH: found the cause',
      ...extra
    }
  }

  it('follows a task another library holds once its proposal ran there', () => {
    const { service } = setup()
    const lifetime = claimLifetime()
    register(service)
    const proposal = propose(service)
    service.decideProposal(
      { clientOperationId: op(), proposalId: proposal.id, decision: 'confirmed' },
      'desktop'
    )
    service.claimProposal({ clientOperationId: op(), proposalId: proposal.id }, CONN_A, lifetime)
    service.recordProposalResults(
      {
        clientOperationId: op(),
        proposalId: proposal.id,
        finalize: false,
        results: [{ index: 0, ok: true, taskId: REMOTE, detail: 'started SSH-7' }]
      },
      CONN_A,
      lifetime
    )
    expect(service.dispatcher.watches(PANE)).toMatchObject({
      ok: true,
      watches: [{ taskId: REMOTE, addedBy: 'proposal' }]
    })
    expect(inbox(service).watchedTaskCount).toBe(1)
  })

  it('reports forwarded facts once, only for followed tasks, and stops following a finished task', () => {
    const { service } = setup()
    register(service)
    service.watchTask({ clientOperationId: op(), paneKey: PANE, taskId: REMOTE })
    service.recordDispatcherFacts({
      clientOperationId: op(),
      paneKey: PANE,
      facts: [
        fact('env-ssh/e1', { needsYou: 'Pick a timeout' }),
        fact('env-ssh/e1'),
        fact('env-other/e9', { taskId: 'runtime:env-other/task-1', taskRef: 'X-1' }),
        {
          sourceId: 'env-ssh/contact/1',
          kind: 'host',
          at: 60,
          taskId: null,
          taskRef: null,
          summary: 'loopback sshd is out of contact'
        }
      ]
    })
    const first = inbox(service)
    expect(first.items.map((item) => [item.kind, item.taskRef, item.needsYou ?? null])).toEqual([
      ['progress', 'SSH-7', 'Pick a timeout'],
      ['host', null, null]
    ])
    service.ackInbox({ clientOperationId: op(), paneKey: PANE, cursor: first.cursor })
    expect(inbox(service).items).toEqual([])

    service.recordDispatcherFacts({
      clientOperationId: op(),
      paneKey: PANE,
      facts: [fact('env-ssh/e2', { kind: 'status', summary: 'moved to Done', finished: true })]
    })
    const second = inbox(service)
    expect(second.watchedTaskCount).toBe(1)
    service.ackInbox({ clientOperationId: op(), paneKey: PANE, cursor: second.cursor })
    expect(inbox(service).watchedTaskCount).toBe(0)
  })
})
