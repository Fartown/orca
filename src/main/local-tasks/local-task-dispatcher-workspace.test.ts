import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FolderWorkspace } from '../../shared/folder-workspaces/folder-workspace-types'
import type { ProjectGroup } from '../../shared/project/groups/project-group-types'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../shared/workspace/identity/floating-workspace-id'
import {
  LOCAL_TASK_DISPATCHER_PANE_PREFERENCE_KEY,
  LOCAL_TASK_DISPATCHER_SESSION_PREFERENCE_KEY,
  LocalTaskDispatcherSessionSchema,
  LocalTaskDispatcherWorkspaceSchema
} from '../../shared/local-tasks/local-task-dispatcher-workspace'
import SyncDatabase from '../sqlite/sync-database'
import { LocalTasksDatabase } from './local-tasks-database'
import { LocalTasksService } from './local-tasks-service'
import type { LocalTaskDispatcherWorkspaceRuntime } from './local-task-dispatcher-workspace'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).toReversed()) {
    cleanup()
  }
})

function fixture(readOnly = false) {
  const root = mkdtempSync(join(tmpdir(), 'dispatcher-source-'))
  let db = LocalTasksDatabase.open('selected-profile', root)
  if (readOnly) {
    const path = db.path
    db.close()
    const raw = new SyncDatabase(path)
    raw.pragma('user_version = 999')
    raw.close()
    db = LocalTasksDatabase.open('selected-profile', root)
  }
  const service = new LocalTasksService(db, () => 1000)
  cleanups.push(() => {
    service.execution.dispose()
    db.close()
    rmSync(root, { recursive: true, force: true })
  })
  const groups: ProjectGroup[] = []
  const folders: FolderWorkspace[] = []
  const createProjectGroup = vi.fn<LocalTaskDispatcherWorkspaceRuntime['createProjectGroup']>(
    async (input) => {
      const group: ProjectGroup = {
        id: `group-${groups.length}`,
        name: input.name,
        parentPath: input.parentPath ?? null,
        connectionId: input.connectionId,
        parentGroupId: null,
        createdFrom: 'manual',
        tabOrder: 0,
        isCollapsed: false,
        color: null,
        createdAt: 1,
        updatedAt: 1
      }
      groups.push(group)
      return group
    }
  )
  const createFolderWorkspace = vi.fn<LocalTaskDispatcherWorkspaceRuntime['createFolderWorkspace']>(
    async (input) => {
      const folder: FolderWorkspace = {
        id: `folder-${folders.length}`,
        projectGroupId: input.projectGroupId,
        name: input.name ?? 'Dispatcher',
        folderPath: input.folderPath!,
        connectionId: input.connectionId,
        creatorProvenance: input.creatorProvenance,
        linkedTask: null,
        comment: '',
        isArchived: false,
        isUnread: false,
        isPinned: false,
        sortOrder: 1,
        lastActivityAt: 1,
        createdAt: 1,
        updatedAt: 1
      }
      folders.push(folder)
      return { folderWorkspace: folder }
    }
  )
  const runtime: LocalTaskDispatcherWorkspaceRuntime = {
    listProjectGroups: () => groups,
    listFolderWorkspaces: () => folders,
    createProjectGroup,
    createFolderWorkspace
  }
  return { root, db, service, runtime, groups, folders, createProjectGroup, createFolderWorkspace }
}

describe('source-owned dispatcher folder workspace', () => {
  it('prepares once for concurrent clients, reuses its catalog and keeps the directory inside this profile', async () => {
    const f = fixture()
    const [first, concurrent] = await Promise.all([
      f.service.prepareDispatcherWorkspace(f.runtime),
      f.service.prepareDispatcherWorkspace(f.runtime)
    ])
    const prepared = LocalTaskDispatcherWorkspaceSchema.parse(first)
    expect(concurrent).toEqual(prepared)
    expect(prepared.worktreeId).toBe('folder:folder-0')
    expect(prepared.worktreeId).not.toBe(FLOATING_TERMINAL_WORKTREE_ID)
    expect(prepared.folderWorkspace.folderPath).toBe(join(dirname(f.db.path), 'dispatcher'))
    expect(statSync(prepared.folderWorkspace.folderPath).isDirectory()).toBe(true)
    expect(f.createProjectGroup).toHaveBeenCalledExactlyOnceWith({
      name: 'Orca',
      parentPath: prepared.folderWorkspace.folderPath,
      connectionId: null
    })
    expect(f.createFolderWorkspace).toHaveBeenCalledExactlyOnceWith({
      projectGroupId: 'group-0',
      name: 'Dispatcher',
      folderPath: prepared.folderWorkspace.folderPath,
      connectionId: null,
      creatorProvenance: { kind: 'host' }
    })
    expect(await f.service.prepareDispatcherWorkspace(f.runtime)).toEqual(prepared)
    expect(f.createProjectGroup).toHaveBeenCalledTimes(1)
    expect(f.createFolderWorkspace).toHaveBeenCalledTimes(1)
    const other = fixture()
    const second = LocalTaskDispatcherWorkspaceSchema.parse(
      await other.service.prepareDispatcherWorkspace(other.runtime)
    )
    expect(second.folderWorkspace.folderPath).not.toBe(prepared.folderWorkspace.folderPath)
  })

  it('keeps a created group after a folder refusal and reuses it on an explicit next attempt', async () => {
    const f = fixture()
    f.createFolderWorkspace.mockRejectedValueOnce(new Error('folder refused'))
    await expect(f.service.prepareDispatcherWorkspace(f.runtime)).rejects.toThrow('folder refused')
    await expect(f.service.prepareDispatcherWorkspace(f.runtime)).resolves.toMatchObject({
      ok: true
    })
    expect(f.createProjectGroup).toHaveBeenCalledTimes(1)
    expect(f.folders).toHaveLength(1)
  })

  it('does not adopt a nested SSH or foreign catalog row that happens to name the same path', async () => {
    const f = fixture()
    const source = LocalTaskDispatcherWorkspaceSchema.parse(
      await f.service.prepareDispatcherWorkspace(f.runtime)
    )
    f.groups[0].connectionId = 'ssh-target'
    f.folders[0].executionHostId = 'runtime:other'
    const next = LocalTaskDispatcherWorkspaceSchema.parse(
      await f.service.prepareDispatcherWorkspace(f.runtime)
    )
    expect(next.projectGroup.id).not.toBe(source.projectGroup.id)
    expect(next.folderWorkspace.id).not.toBe(source.folderWorkspace.id)
    expect(next.folderWorkspace.connectionId).toBeNull()
    expect(f.groups).toHaveLength(2)
    expect(f.folders).toHaveLength(2)
  })

  it('leaves a newer read-only profile untouched before preparing any directory or catalog', async () => {
    const f = fixture(true)
    expect(await f.service.prepareDispatcherWorkspace(f.runtime)).toEqual({
      ok: false,
      code: 'read_only'
    })
    expect(() => statSync(join(dirname(f.db.path), 'dispatcher'))).toThrow()
    expect(f.createProjectGroup).not.toHaveBeenCalled()
    expect(f.createFolderWorkspace).not.toHaveBeenCalled()
  })

  it('refuses a workspace creation result redirected by a host plugin to another execution location', async () => {
    const f = fixture()
    const create = f.createFolderWorkspace.getMockImplementation()!
    f.createFolderWorkspace.mockImplementationOnce(async (input) => {
      const created = await create(input)
      return {
        ...created,
        folderWorkspace: { ...created.folderWorkspace, connectionId: 'ssh:other' }
      }
    })
    await expect(f.service.prepareDispatcherWorkspace(f.runtime)).rejects.toThrow(
      'does not belong to this profile directory'
    )
  })

  it('does not create a folder against a new profile after the source task database closes', async () => {
    const f = fixture()
    let release: (() => void) | undefined
    const groupReady = new Promise<void>((resolve) => {
      release = resolve
    })
    const create = f.createProjectGroup.getMockImplementation()!
    f.createProjectGroup.mockImplementationOnce(async (input) => {
      await groupReady
      return create(input)
    })
    const preparing = f.service.prepareDispatcherWorkspace(f.runtime)
    await vi.waitFor(() => expect(f.createProjectGroup).toHaveBeenCalledTimes(1))
    f.db.close()
    release!()
    await expect(preparing).rejects.toThrow('closed')
    expect(f.createFolderWorkspace).not.toHaveBeenCalled()
  })
})

describe('registered dispatcher workspace metadata', () => {
  it('persists the source workspace with register, carries its conversation forward, and replays without another commit', () => {
    const { db, service } = fixture()
    const first = service.registerDispatcher({
      clientOperationId: 'register-1',
      paneKey: 'old:pane',
      worktreeId: 'folder:source',
      agent: 'claude'
    })
    expect(first.ok).toBe(true)
    service.watchTask({ clientOperationId: 'watch', paneKey: 'old:pane', taskId: 'ref:ORCA-7' })
    const input = {
      clientOperationId: 'register-2',
      paneKey: 'new:pane',
      previousPaneKey: 'old:pane',
      worktreeId: 'folder:source',
      agent: 'codex'
    }
    const next = service.registerDispatcher(input)
    expect(next).toMatchObject({
      ok: true,
      conversation: { id: first.ok ? first.conversation.id : '', paneKey: 'new:pane' }
    })
    const preferences = service.getPreferences([
      LOCAL_TASK_DISPATCHER_PANE_PREFERENCE_KEY,
      LOCAL_TASK_DISPATCHER_SESSION_PREFERENCE_KEY
    ]).values
    expect(preferences[LOCAL_TASK_DISPATCHER_PANE_PREFERENCE_KEY]).toBe('new:pane')
    expect(
      LocalTaskDispatcherSessionSchema.parse(
        JSON.parse(preferences[LOCAL_TASK_DISPATCHER_SESSION_PREFERENCE_KEY]!)
      )
    ).toEqual({ worktreeId: 'folder:source', paneKey: 'new:pane' })
    expect(service.dispatcher.watches('new:pane')).toMatchObject({
      ok: true,
      watches: [{ taskId: 'ref:ORCA-7' }]
    })
    const revision = db.revision()
    expect(service.registerDispatcher(input)).toEqual(next)
    expect(db.revision()).toBe(revision)
  })

  it('keeps legacy register calls on the existing local floating workspace', () => {
    const { service } = fixture()
    service.registerDispatcher({ clientOperationId: 'legacy', paneKey: 'old:pane' })
    expect(
      JSON.parse(
        service.getPreferences([LOCAL_TASK_DISPATCHER_SESSION_PREFERENCE_KEY]).values[
          LOCAL_TASK_DISPATCHER_SESSION_PREFERENCE_KEY
        ]!
      )
    ).toEqual({ worktreeId: FLOATING_TERMINAL_WORKTREE_ID, paneKey: 'old:pane' })
  })

  it('rolls back the conversation, preferences and receipt together when session metadata cannot save', () => {
    const { db, service } = fixture()
    const original = service.registerDispatcher({
      clientOperationId: 'first',
      paneKey: 'old:pane',
      worktreeId: 'folder:old'
    })
    const before = service.getPreferences([
      LOCAL_TASK_DISPATCHER_PANE_PREFERENCE_KEY,
      LOCAL_TASK_DISPATCHER_SESSION_PREFERENCE_KEY
    ])
    const revision = db.revision()
    db.prepare(
      "CREATE TEMP TRIGGER fail_dispatcher_session BEFORE INSERT ON local_task_preferences BEGIN SELECT RAISE(ABORT, 'forced metadata failure'); END"
    ).run()
    expect(() =>
      service.registerDispatcher({
        clientOperationId: 'failed',
        paneKey: 'new:pane',
        previousPaneKey: 'old:pane',
        worktreeId: 'folder:new'
      })
    ).toThrow('forced metadata failure')
    expect(service.dispatcher.conversationFor('old:pane')).toEqual(
      original.ok ? original.conversation : null
    )
    expect(service.dispatcher.conversationFor('new:pane')).toBeNull()
    expect(
      service.getPreferences([
        LOCAL_TASK_DISPATCHER_PANE_PREFERENCE_KEY,
        LOCAL_TASK_DISPATCHER_SESSION_PREFERENCE_KEY
      ])
    ).toEqual(before)
    expect(db.revision()).toBe(revision)
    expect(
      db
        .prepare("SELECT 1 FROM local_task_mutation_receipts WHERE client_operation_id = 'failed'")
        .get()
    ).toBeUndefined()
  })
})
