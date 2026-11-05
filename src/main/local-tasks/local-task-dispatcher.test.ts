import { describe, expect, it } from 'vitest'
// Why a value import: the Bun runner only moves SQLite tests to Node when they import this directly.
import SyncDatabase from '../sqlite/sync-database'
import type { LocalTaskProgressSnapshot } from '../../shared/local-tasks/local-task-link-types'
import { LocalTaskDispatcher } from './local-task-dispatcher'
import { LocalTasksDatabase } from './local-tasks-database'
import { LocalTasksService } from './local-tasks-service'

void SyncDatabase

let opId = 0
const op = (): string => `op-${++opId}`
const PANE = 'tab-d:pane-d'

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
    register(service)
    const proposal = propose(service)
    service.decideProposal(
      { clientOperationId: op(), proposalId: proposal.id, decision: 'confirmed' },
      'desktop'
    )
    const started = task('Investigate retries')
    const recorded = service.recordProposalResults({
      clientOperationId: op(),
      proposalId: proposal.id,
      results: [
        { index: 0, ok: true, taskId: started.id },
        { index: 1, ok: false, detail: 'host out of contact' }
      ]
    })
    expect(recorded).toMatchObject({ ok: true, proposal: { status: 'executed' } })
    const box = inbox(service)
    expect(box.watchedTaskCount).toBe(1)
    expect(box.items.map((item) => item.summary)).toEqual([
      'The user confirmed your proposal (Investigate retries); 1 done, 1 failed — item 2: host out of contact'
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
    const write = (taskId: string, body: string, progress?: object, source = 'cli' as const) =>
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
      ['progress', 'SHOP-1', 'Fix reconnect: Found the loop'],
      ['comment', 'SHOP-1', 'Fix reconnect: Prefer 30s'],
      ['status', 'SHOP-1', 'Fix reconnect moved to In Review — waiting for the user to review']
    ])
    expect(box.items[0].needsYou).toBe('Pick a timeout')

    service.ackInbox({ clientOperationId: op(), paneKey: PANE, cursor: box.cursor })
    expect(inbox(service).items).toEqual([])
    write(watched.id, 'Repro written', {})
    expect(inbox(service).items.map((item) => item.summary)).toEqual([
      'Fix reconnect: Repro written'
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
    expect(inbox(service).items.map((item) => item.summary)).toEqual(['Long task: three'])
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
    const dispatcher = new LocalTaskDispatcher(db, () => snapshot)
    const first = dispatcher.inbox(PANE)
    if (!first.ok) {
      throw new Error(first.code)
    }
    expect(first.inbox.items.map((item) => item.summary)).toEqual([
      'Needs approval: codex waits for the user to approve — Allow npm install?'
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
