import { afterEach, describe, expect, it, vi } from 'vitest'
import { localTaskForeignSessionHostId } from '../../shared/local-tasks/local-task-session-origin'
import { claimLocalTaskSessionPane } from './local-task-session-links'
import {
  disposeLocalTaskExecutionFixtures,
  fakeHost,
  LEAF,
  linkWorktree,
  op,
  recordTerminal,
  setup,
  SHOP
} from './local-task-execution.test-fixture'

const INSTALLATION = '11111111-1111-4111-8111-111111111111'
const ORIGIN = { installationId: INSTALLATION, hostId: 'local', hostLabel: 'Local Mac' }
const FOREIGN_WORKSPACE = 'other-repo::/work/other'

afterEach(disposeLocalTaskExecutionFixtures)

describe('manual cross-host task session links', () => {
  it('attaches an existing foreign session without changing the task default workspace', () => {
    const { work, task } = setup()
    const owner = task('A task on mini')
    linkWorktree(work, owner.id, SHOP)
    const workspace = work.listLinks().workspaces[0]
    const result = work.recordSession(
      {
        clientOperationId: op(),
        taskId: owner.id,
        hostId: 'local',
        worktreeId: FOREIGN_WORKSPACE,
        surface: 'terminal',
        paneKey: 'foreign-tab:leaf',
        linkedVia: 'manual',
        executionOrigin: ORIGIN
      },
      'desktop'
    )
    expect(result).toMatchObject({
      ok: true,
      session: {
        hostId: localTaskForeignSessionHostId(ORIGIN),
        worktreeId: FOREIGN_WORKSPACE,
        instanceId: null,
        executionOrigin: ORIGIN
      }
    })
    expect(work.listLinks().workspaces).toEqual([workspace])
    expect(work.listLinks().sessions).toMatchObject([{ executionOrigin: ORIGIN }])
  })

  it('links to a task without a default workspace only through the explicit manual origin path', () => {
    const { work, task } = setup()
    const owner = task('A task with no default workspace')
    const input = {
      taskId: owner.id,
      hostId: 'local',
      worktreeId: FOREIGN_WORKSPACE,
      surface: 'chat' as const,
      sessionId: 'chat-1',
      linkedVia: 'manual' as const
    }
    expect(work.recordSession({ ...input, clientOperationId: op() }, 'desktop')).toEqual({
      ok: false,
      code: 'workspace_required'
    })
    expect(
      work.recordSession({ ...input, executionOrigin: ORIGIN, clientOperationId: op() }, 'desktop')
    ).toMatchObject({ ok: true })
    expect(
      work.recordSession(
        { ...input, executionOrigin: ORIGIN, linkedVia: 'start', clientOperationId: op() },
        'desktop'
      )
    ).toEqual({ ok: false, code: 'invalid_argument' })
    expect(work.listLinks().workspaces).toEqual([])
  })

  it('isolates identical raw pane and session ids by their execution owner', () => {
    const { work, task } = setup()
    const nativeTask = task('Native')
    linkWorktree(work, nativeTask.id, SHOP)
    const native = recordTerminal(work, nativeTask.id, { paneKey: 'tab:leaf' })
    const foreignTask = task('Foreign')
    const input = {
      taskId: foreignTask.id,
      hostId: 'local',
      worktreeId: FOREIGN_WORKSPACE,
      surface: 'terminal' as const,
      paneKey: 'tab:leaf',
      sessionId: 'session',
      linkedVia: 'manual' as const,
      executionOrigin: ORIGIN
    }
    const foreign = work.recordSession({ ...input, clientOperationId: op() }, 'desktop')
    expect(foreign).toMatchObject({ ok: true })
    expect(recordTerminal(work, nativeTask.id, { paneKey: 'tab:leaf' }).id).toBe(native.id)
    const other = task('Other origin')
    const secondOrigin = { ...ORIGIN, installationId: '22222222-2222-4222-8222-222222222222' }
    expect(
      work.recordSession(
        { ...input, taskId: other.id, executionOrigin: secondOrigin, clientOperationId: op() },
        'desktop'
      )
    ).toMatchObject({ ok: true })
    expect(
      work.recordSession({ ...input, taskId: other.id, clientOperationId: op() }, 'desktop')
    ).toMatchObject({ ok: false, code: 'session_already_linked' })
    expect(work.listLinks().sessions).toHaveLength(3)
  })

  it('never claims or judges foreign panes from this library host status', () => {
    const host = fakeHost()
    const paneKeys = vi.spyOn(host.source, 'paneKeys')
    const rowsForPane = vi.spyOn(host.source, 'rowsForPane')
    const inContact = vi.spyOn(host.source, 'inContact')
    const { db, work, task } = setup({ host })
    const owner = task('Foreign')
    host.report('tab:leaf', { state: 'waiting' })
    const result = work.recordSession(
      {
        clientOperationId: op(),
        taskId: owner.id,
        hostId: 'local',
        worktreeId: FOREIGN_WORKSPACE,
        surface: 'terminal',
        tabId: 'tab',
        linkedVia: 'manual',
        executionOrigin: ORIGIN
      },
      'desktop'
    )
    if (!result.ok) {
      throw new Error(result.code)
    }
    expect(work.getProgress()).toMatchObject({
      sessions: [{ taskSessionId: result.session.id, state: 'unverifiable' }],
      items: []
    })
    expect(claimLocalTaskSessionPane(db, result.session.id, 'tab:leaf')).toBe(false)
    expect(paneKeys).not.toHaveBeenCalled()
    expect(rowsForPane).not.toHaveBeenCalled()
    expect(inContact).not.toHaveBeenCalled()
    expect(work.listLinks().sessions[0].paneKey).toBeNull()
  })

  it.each(['local', 'ssh:owned'])(
    'keeps native pane claims separate from a foreign %s origin',
    (hostId) => {
      const { db, work, task, host } = setup()
      const foreignOwner = task('Foreign')
      const foreign = work.recordSession(
        {
          clientOperationId: op(),
          taskId: foreignOwner.id,
          hostId,
          worktreeId: FOREIGN_WORKSPACE,
          surface: 'terminal',
          tabId: 'tab',
          paneKey: 'tab:leaf',
          linkedVia: 'manual',
          executionOrigin: { ...ORIGIN, hostId }
        },
        'desktop'
      )
      if (!foreign.ok) {
        throw new Error(foreign.code)
      }
      const nativeOwner = task('Native')
      linkWorktree(work, nativeOwner.id, SHOP)
      const native = recordTerminal(work, nativeOwner.id, { tabId: 'tab' })
      expect(claimLocalTaskSessionPane(db, native.id, 'tab:leaf')).toBe(true)
      host.report('tab:leaf', { state: 'waiting' })
      expect(work.getProgress()).toMatchObject({
        sessions: expect.arrayContaining([
          {
            taskSessionId: foreign.session.id,
            state: 'unverifiable',
            lastMessage: null,
            stateSince: null,
            unread: false
          },
          expect.objectContaining({ taskSessionId: native.id, state: 'waiting' })
        ]),
        items: [expect.objectContaining({ taskSessionId: native.id })]
      })
      expect(work.listLinks().sessions).toMatchObject([
        { id: foreign.session.id, paneKey: 'tab:leaf', executionOrigin: { ...ORIGIN, hostId } },
        { id: native.id, paneKey: 'tab:leaf' }
      ])
      expect(claimLocalTaskSessionPane(db, foreign.session.id, 'tab:other')).toBe(false)
    }
  )

  it('refuses an origin with a conflicting location or a client-only runtime id', () => {
    const { work, task } = setup()
    const owner = task('Foreign')
    const input = {
      taskId: owner.id,
      hostId: 'ssh:other',
      worktreeId: FOREIGN_WORKSPACE,
      surface: 'terminal' as const,
      paneKey: 'tab:leaf',
      linkedVia: 'manual' as const,
      executionOrigin: ORIGIN
    }
    expect(work.recordSession({ ...input, clientOperationId: op() }, 'desktop')).toEqual({
      ok: false,
      code: 'invalid_argument'
    })
    expect(
      work.recordSession(
        {
          ...input,
          hostId: 'local',
          executionOrigin: { ...ORIGIN, hostId: 'runtime:env' },
          clientOperationId: op()
        },
        'desktop'
      )
    ).toEqual({ ok: false, code: 'invalid_argument' })
  })

  describe.each(['local', 'ssh:owned'])('same profile %s aliases', (hostId) => {
    it.each([
      ['pane', false],
      ['pane', true],
      ['session', false],
      ['session', true]
    ] as const)('rejects duplicate %s with foreign first=%s', (identity, foreignFirst) => {
      const { work, task, host } = setup()
      host.source.installationId = () => INSTALLATION
      const nativeTask = task('Native')
      const foreignTask = task('Explicit origin')
      linkWorktree(work, nativeTask.id, SHOP, { hostId })
      const ids = identity === 'pane' ? { paneKey: 'tab:leaf' } : { sessionId: 'session' }
      const common = {
        hostId,
        surface: 'terminal' as const,
        linkedVia: 'manual' as const,
        ...ids
      }
      const native = { ...common, taskId: nativeTask.id, worktreeId: SHOP }
      const foreign = {
        ...common,
        taskId: foreignTask.id,
        worktreeId: FOREIGN_WORKSPACE,
        executionOrigin: { ...ORIGIN, hostId }
      }
      const [first, second] = foreignFirst ? [foreign, native] : [native, foreign]
      expect(work.recordSession({ ...first, clientOperationId: op() }, 'desktop')).toMatchObject({
        ok: true
      })
      expect(work.recordSession({ ...second, clientOperationId: op() }, 'desktop')).toMatchObject({
        ok: false,
        code: 'session_already_linked'
      })
      expect(work.listLinks().sessions).toHaveLength(1)
    })
  })

  it('keeps different owned execution hosts separate even when they share this installation', () => {
    const { work, task, host } = setup()
    host.source.installationId = () => INSTALLATION
    const nativeTask = task('Local')
    linkWorktree(work, nativeTask.id, SHOP)
    recordTerminal(work, nativeTask.id, { paneKey: 'tab:leaf' })
    const foreignTask = task('SSH')
    expect(
      work.recordSession(
        {
          clientOperationId: op(),
          taskId: foreignTask.id,
          hostId: 'ssh:owned',
          worktreeId: FOREIGN_WORKSPACE,
          surface: 'terminal',
          paneKey: 'tab:leaf',
          linkedVia: 'manual',
          executionOrigin: { ...ORIGIN, hostId: 'ssh:owned' }
        },
        'desktop'
      )
    ).toMatchObject({ ok: true })
    expect(work.listLinks().sessions).toHaveLength(2)
  })

  it('checks a native pending tab before attaching a resolved pane from its same-profile alias', () => {
    const { work, task } = setup()
    const nativeTask = task('Native')
    linkWorktree(work, nativeTask.id, SHOP)
    recordTerminal(work, nativeTask.id, { tabId: 'tab' })
    const foreignTask = task('Explicit origin')
    expect(
      work.recordSession(
        {
          clientOperationId: op(),
          taskId: foreignTask.id,
          hostId: 'local',
          worktreeId: FOREIGN_WORKSPACE,
          surface: 'terminal',
          paneKey: `tab:${LEAF}`,
          linkedVia: 'manual',
          executionOrigin: ORIGIN
        },
        'desktop',
        INSTALLATION
      )
    ).toMatchObject({ ok: false, code: 'session_already_linked' })
  })

  it('does not claim a pane held by its same-profile foreign alias when identity becomes available', () => {
    const { db, work, task } = setup()
    const foreignTask = task('Explicit origin')
    expect(
      work.recordSession(
        {
          clientOperationId: op(),
          taskId: foreignTask.id,
          hostId: 'local',
          worktreeId: FOREIGN_WORKSPACE,
          surface: 'terminal',
          paneKey: 'tab:leaf',
          linkedVia: 'manual',
          executionOrigin: ORIGIN
        },
        'desktop'
      )
    ).toMatchObject({ ok: true })
    const nativeTask = task('Native pending')
    linkWorktree(work, nativeTask.id, SHOP)
    const native = recordTerminal(work, nativeTask.id, { tabId: 'tab' })
    expect(claimLocalTaskSessionPane(db, native.id, 'tab:leaf', INSTALLATION)).toBe(false)
    expect(work.listLinks().sessions.find((link) => link.id === native.id)?.paneKey).toBeNull()
  })
})
