import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'

import { withDurableRuntimeStore } from '../runtime/construction/test-context/runtime-durable-store-fixture'
import { getDefaultWorkspaceSession } from '../../shared/orca-profiles/constants'
import { folderWorkspaceKey } from '../../shared/workspace/identity/workspace-scope'
import { OrcaRuntimeService } from '../runtime/orca-runtime'

// Project-group folder workspaces have no repo row, so a Git-only selector never finds them.
const FOLDER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const WORKSPACE_ID = folderWorkspaceKey(FOLDER_ID)
const FOLDER_PATH = tmpdir()

function createRuntime() {
  const folder = {
    id: FOLDER_ID,
    projectGroupId: 'group-1',
    name: 'home',
    folderPath: FOLDER_PATH,
    linkedTask: {},
    comment: '',
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 1,
    createdAt: 1,
    updatedAt: 1
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: fixture supplies only the store reads these commands make.
  const store = withDurableRuntimeStore({
    getRepos: () => [],
    getRepo: () => undefined,
    getProjectGroups: () => [
      { id: 'group-1', name: 'Home', parentPath: FOLDER_PATH, connectionId: null }
    ],
    getFolderWorkspaces: () => [folder],
    getFolderWorkspace: (id: string) => (id === folder.id ? folder : undefined),
    getAllWorktreeMeta: () => ({}),
    getWorktreeMeta: () => undefined,
    setWorktreeMeta: () => ({}),
    getWorkspaceSession: () => ({ ...getDefaultWorkspaceSession(), activeWorktreeId: null }),
    setWorkspaceSession: () => {},
    readTerminalScrollbackSnapshotAsync: async () => null,
    statTerminalScrollbackSnapshotSize: async () => null,
    flushOrThrow: () => {}
  }) as never
  const runtime = new OrcaRuntimeService(store)
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the fake implements only the controller calls these commands make.
  runtime.setPtyController({
    write: () => true,
    kill: () => true,
    stopAndWait: async () => true,
    getForegroundProcess: async () => null,
    listProcesses: async () => []
  } as never)
  return runtime
}

function runtimeWithFolderTerminal() {
  const runtime = createRuntime()
  const leafId = '22222222-2222-4222-8222-222222222222'
  runtime.attachWindow(1)
  const handle = runtime.preAllocateHandleForPty('folder-pty')
  runtime.registerPty('folder-pty', WORKSPACE_ID, null, { tabId: 'tab-1', leafId })
  runtime.syncWindowGraph(1, {
    tabs: [
      { tabId: 'tab-1', worktreeId: WORKSPACE_ID, title: '', activeLeafId: leafId, layout: null }
    ],
    leaves: [
      { tabId: 'tab-1', worktreeId: WORKSPACE_ID, leafId, paneRuntimeId: 1, ptyId: 'folder-pty' }
    ]
  })
  return { runtime, handle }
}

describe('fresh terminal inventory for an independent folder workspace', () => {
  it('activates it from a phone without requiring a repo row', async () => {
    const { runtime } = runtimeWithFolderTerminal()

    await expect(
      runtime.activateManagedWorktree(`id:${WORKSPACE_ID}`, {
        clientKind: 'mobile',
        navigation: 'caller'
      })
    ).resolves.toMatchObject({ worktreeId: WORKSPACE_ID, activated: true })
  })

  it('retains the live PTY when its provider only reports its working directory', async () => {
    const { runtime, handle } = runtimeWithFolderTerminal()
    runtime.setPtyController({
      write: () => true,
      kill: () => true,
      getForegroundProcess: async () => null,
      listProcesses: async () => [
        {
          id: 'folder-pty',
          cwd: FOLDER_PATH,
          title: 'Folder terminal',
          incarnationId: 'folder-incarnation'
        }
      ]
    })

    const listed = await runtime.listTerminals(`id:${WORKSPACE_ID}`, 20, {
      requireFreshPtyLiveness: true
    })

    expect(listed.terminals).toEqual([
      expect.objectContaining({ handle, ptyId: 'folder-pty', incarnationId: 'folder-incarnation' })
    ])
  })
})
