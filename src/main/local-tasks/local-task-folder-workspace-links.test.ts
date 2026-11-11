import { afterEach, describe, expect, it } from 'vitest'
// Why: the Bun runner only moves SQLite tests to Node when they import this directly.
import '../sqlite/sync-database'
import {
  disposeLocalTaskExecutionFixtures,
  HOST,
  linkWorktree,
  op,
  recordTerminal,
  setup,
  SHOP
} from './local-task-execution.test-fixture'

afterEach(() => {
  disposeLocalTaskExecutionFixtures()
})

describe('folder workspace links', () => {
  it('tells a folder workspace’s sessions from a subtask’s own worktree when unlinking or replacing', () => {
    const { db, work, task } = setup()
    const parent = task('文件夹父任务')
    const inheriting = task('沿用父任务的子任务', parent.id)
    const ownWork = task('自己有 worktree 的子任务', parent.id)
    const linkFolder = (folderWorkspaceId: string, replace?: boolean) =>
      work.linkWorkspace(
        {
          clientOperationId: op(),
          taskId: parent.id,
          hostId: HOST,
          kind: 'folder',
          folderWorkspaceId,
          linkedVia: 'manual',
          ...(replace ? { replace } : {})
        },
        'desktop'
      )
    expect(linkFolder('notes').ok).toBe(true)
    linkWorktree(work, ownWork.id, 'repo-api::/Users/me/api')
    const inFolder = recordTerminal(work, parent.id, { paneKey: 'tab-folder:leaf' })
    expect(inFolder.worktreeId).toBe('folder:notes')
    recordTerminal(work, inheriting.id, { paneKey: 'tab-inherit:leaf' })
    const own = recordTerminal(work, ownWork.id, { paneKey: 'tab-api:leaf' })
    // A session that cannot say where it ran is judged by where its task works.
    const ownUnknown = recordTerminal(work, ownWork.id, { paneKey: 'tab-api-2:leaf' })
    db.prepare(
      'UPDATE local_task_sessions SET worktree_id = NULL, instance_id = NULL WHERE id = ?'
    ).run(ownUnknown.id)
    const sessionIds = () =>
      work
        .listLinks()
        .sessions.map((session) => session.id)
        .sort()

    expect(linkFolder('notes-2', true).ok).toBe(true)
    expect(sessionIds()).toEqual([own.id, ownUnknown.id].sort())

    const later = recordTerminal(work, parent.id, { paneKey: 'tab-folder-2:leaf' })
    expect(work.unlinkWorkspace({ clientOperationId: op(), taskId: parent.id }, 'desktop')).toEqual(
      { ok: true }
    )
    expect(sessionIds()).toEqual([own.id, ownUnknown.id].sort())
    expect(later.worktreeId).toBe('folder:notes-2')
  })

  it('accepts only sessions in a folder workspace itself, not another workspace on the host', () => {
    const { work, task } = setup()
    const parent = task('文件夹任务')
    work.linkWorkspace(
      {
        clientOperationId: op(),
        taskId: parent.id,
        hostId: HOST,
        kind: 'folder',
        folderWorkspaceId: 'notes',
        linkedVia: 'manual'
      },
      'desktop'
    )
    const record = (worktreeId: string, paneKey: string, hostId = HOST) =>
      work.recordSession(
        {
          clientOperationId: op(),
          taskId: parent.id,
          hostId,
          worktreeId,
          surface: 'terminal',
          paneKey,
          linkedVia: 'manual'
        },
        'desktop'
      )
    expect(record(SHOP, 'tab-shop:leaf')).toEqual({ ok: false, code: 'invalid_argument' })
    expect(record('folder:other', 'tab-other:leaf')).toEqual({
      ok: false,
      code: 'invalid_argument'
    })
    // The same folder id on an SSH target is another folder.
    expect(record('folder:notes', 'tab-ssh:leaf', 'ssh:mini')).toEqual({
      ok: false,
      code: 'invalid_argument'
    })
    expect(record('folder:notes', 'tab-notes:leaf')).toMatchObject({
      ok: true,
      session: { worktreeId: 'folder:notes' }
    })
  })
})
