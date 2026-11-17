import { afterEach, describe, expect, it } from 'vitest'
import type { LocalTasksLinksRecordSessionInput } from '../../shared/local-tasks/local-tasks-link-rpc-params'
import {
  disposeLocalTaskExecutionFixtures,
  LEAF,
  linkWorktree,
  op,
  recordTerminal,
  setup,
  SHOP
} from './local-task-execution.test-fixture'

const INSTALLATION = '11111111-1111-4111-8111-111111111111'
const ORIGIN = { installationId: INSTALLATION, hostId: 'local', hostLabel: 'Local Mac' }
const PANE = `tab:${LEAF}`

afterEach(disposeLocalTaskExecutionFixtures)

function nativePair() {
  const fixture = setup()
  const from = fixture.task('Original')
  linkWorktree(fixture.work, from.id, SHOP)
  const original = recordTerminal(fixture.work, from.id, { paneKey: PANE })
  const target = fixture.task('Replacement', from.id)
  const input: LocalTasksLinksRecordSessionInput = {
    clientOperationId: op(),
    taskId: target.id,
    hostId: 'local',
    worktreeId: SHOP,
    surface: 'terminal',
    paneKey: PANE,
    linkedVia: 'manual',
    replacingSessionLinkId: original.id
  }
  return { ...fixture, original, target, input }
}

describe('atomic manual session replacement', () => {
  it('replaces a native association in one commit and replays its receipt after the old row is gone', () => {
    const { db, work, original, target, input } = nativePair()
    db.prepare(
      'INSERT INTO local_task_attention_state (item_key, task_session_id, seen_at, created_at) VALUES (?, ?, 1, 1)'
    ).run('old-mark', original.id)
    const workspaces = work.listLinks().workspaces
    const commits: string[][] = []
    const stop = db.onCommit(({ scopes }) => commits.push(scopes))
    const result = work.recordSession(input, 'desktop')
    expect(result).toMatchObject({
      ok: true,
      session: { taskId: target.id, paneKey: PANE, agent: original.agent }
    })
    expect(work.listLinks().sessions).toEqual(result.ok ? [result.session] : [])
    expect(work.listLinks().workspaces).toEqual(workspaces)
    expect(db.prepare('SELECT * FROM local_task_attention_state').all()).toEqual([])
    expect(commits).toHaveLength(1)
    const revision = db.revision()
    expect(work.recordSession(input, 'desktop')).toEqual(result)
    expect(db.revision()).toBe(revision)
    expect(commits).toHaveLength(1)
    stop()
  })

  it('permits native to explicit-origin replacement without moving the destination default workspace', () => {
    const { work, task, original, input } = nativePair()
    const destination = task('Task defaulting to SSH')
    linkWorktree(work, destination.id, 'repo::/ssh/default', { hostId: 'ssh:owned' })
    const workspaces = work.listLinks().workspaces
    const result = work.recordSession(
      { ...input, taskId: destination.id, executionOrigin: ORIGIN },
      'desktop',
      INSTALLATION
    )
    expect(result).toMatchObject({
      ok: true,
      session: { executionOrigin: ORIGIN, worktreeId: SHOP, paneKey: PANE }
    })
    expect(work.listLinks().sessions.some((link) => link.id === original.id)).toBe(false)
    expect(work.listLinks().workspaces).toEqual(workspaces)
  })

  it('permits explicit-origin to native replacement only for the same verified profile', () => {
    const { work, task } = setup()
    const originalTask = task('External')
    const original = work.recordSession(
      {
        clientOperationId: op(),
        taskId: originalTask.id,
        hostId: 'local',
        worktreeId: SHOP,
        surface: 'terminal',
        paneKey: PANE,
        linkedVia: 'manual',
        executionOrigin: ORIGIN
      },
      'desktop'
    )
    if (!original.ok) {
      throw new Error(original.code)
    }
    const target = task('Native')
    linkWorktree(work, target.id, SHOP)
    const input: LocalTasksLinksRecordSessionInput = {
      clientOperationId: op(),
      taskId: target.id,
      hostId: 'local',
      worktreeId: SHOP,
      surface: 'terminal',
      paneKey: PANE,
      linkedVia: 'manual',
      replacingSessionLinkId: original.session.id
    }
    expect(work.recordSession(input, 'desktop')).toEqual({ ok: false, code: 'invalid_argument' })
    const result = work.recordSession(
      { ...input, clientOperationId: op() },
      'desktop',
      INSTALLATION
    )
    expect(result).toMatchObject({ ok: true, session: { hostId: 'local', taskId: target.id } })
    expect(result.ok && result.session.executionOrigin).toBeUndefined()
  })

  it.each<Partial<LocalTasksLinksRecordSessionInput>>([
    { linkedVia: 'start' },
    { worktreeId: 'repo::/another/workspace' },
    { paneKey: 'different-pane' },
    { surface: 'chat', sessionId: 'different-session' },
    { executionOrigin: { ...ORIGIN, installationId: '22222222-2222-4222-8222-222222222222' } }
  ])('preserves the original when the proposed replacement is invalid: %j', (patch) => {
    const { work, original, input } = nativePair()
    expect(work.recordSession({ ...input, ...patch }, 'desktop', INSTALLATION)).toEqual({
      ok: false,
      code: 'invalid_argument'
    })
    expect(work.listLinks().sessions).toEqual([original])
  })

  it('preserves the original when a second existing session conflicts with new metadata', () => {
    const { work, task, original, input } = nativePair()
    const other = task('Another session', original.taskId)
    expect(
      work.recordSession(
        {
          clientOperationId: op(),
          taskId: other.id,
          hostId: 'local',
          worktreeId: SHOP,
          surface: 'terminal',
          sessionId: 'held-session',
          paneKey: `other:${LEAF}`,
          linkedVia: 'manual'
        },
        'desktop'
      )
    ).toMatchObject({ ok: true })
    const before = work.listLinks()
    expect(work.recordSession({ ...input, sessionId: 'held-session' }, 'desktop')).toMatchObject({
      ok: false,
      code: 'session_already_linked'
    })
    expect(work.listLinks()).toEqual(before)
  })

  it('does not replace the execution workspace with the new task default when input omits it', () => {
    const { work, task, original, input } = nativePair()
    const other = task('Different default workspace')
    linkWorktree(work, other.id, 'repo::/different/default')
    expect(
      work.recordSession({ ...input, taskId: other.id, worktreeId: undefined }, 'desktop')
    ).toEqual({ ok: false, code: 'invalid_argument' })
    expect(work.listLinks().sessions).toEqual([original])
  })

  it('rolls back the original association, attention marks, events and revision if insertion fails', () => {
    const { db, work, original, input } = nativePair()
    db.prepare(
      'INSERT INTO local_task_attention_state (item_key, task_session_id, seen_at, created_at) VALUES (?, ?, 1, 1)'
    ).run('old-mark', original.id)
    const before = {
      links: work.listLinks(),
      revision: db.revision(),
      events: db.prepare('SELECT * FROM local_task_events ORDER BY rowid').all()
    }
    db.prepare(
      "CREATE TEMP TRIGGER fail_session_replacement BEFORE INSERT ON local_task_sessions BEGIN SELECT RAISE(ABORT, 'forced relink failure'); END"
    ).run()
    expect(() => work.recordSession(input, 'desktop')).toThrow('forced relink failure')
    expect(work.listLinks()).toEqual(before.links)
    expect(db.revision()).toBe(before.revision)
    expect(db.prepare('SELECT * FROM local_task_events ORDER BY rowid').all()).toEqual(
      before.events
    )
    expect(db.prepare('SELECT task_session_id FROM local_task_attention_state').get()).toEqual({
      task_session_id: original.id
    })
    expect(
      db
        .prepare('SELECT 1 FROM local_task_mutation_receipts WHERE client_operation_id = ?')
        .get(input.clientOperationId)
    ).toBeUndefined()
  })
})
