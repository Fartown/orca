import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LOCAL_TASKS_RUNTIME_CAPABILITY } from '../../../src/shared/local-tasks/local-tasks-capability'
import type { ActionSheetAction } from '../components/ActionSheetModal'
import type { RpcClient } from '../transport/rpc-client'
import type { ConnectionState, RpcResponse } from '../transport/types'
import type { Worktree } from '../worktree/workspace-list-types'
import {
  createLocalTaskHostLibraries,
  LocalTaskHostRowsContext,
  type LocalTaskHostRows
} from './local-task-host-rows'
import { useLocalTaskHostLinkAction } from './use-local-task-host-link-action'

vi.mock('lucide-react-native', () => ({ ClipboardList: 'ClipboardList' }))
vi.mock('./local-task-link-to-task-sheet', () => ({ LocalTaskLinkToTaskSheet: () => null }))

const row: Worktree = {
  workspaceKind: 'git',
  worktreeId: 'repo::/w/shop-12',
  repoId: 'repo',
  repo: 'shop',
  branch: 'zc/shop-12',
  displayName: 'shop-12',
  path: '/w/shop-12',
  liveTerminalCount: 0,
  hasAttachedPty: false,
  unread: false,
  isPinned: false,
  linkedPR: null
}

/** A library that counts its projects, and the calls the long-press made to it. */
function library(projectCount: number, sourceHidden?: boolean) {
  const calls: string[] = []
  const client: RpcClient = {
    sendRequest: async (method: string): Promise<RpcResponse> => {
      calls.push(method)
      return {
        id: method,
        ok: true,
        result: {
          taskHost: true,
          state: 'ready',
          reason: null,
          revision: 1,
          taskHostId: 'h',
          projectCount,
          ...(sourceHidden === undefined ? {} : { sourceHidden })
        }
      }
    },
    subscribe: () => () => {},
    updateTerminalSubscriptionViewport: () => {},
    getState: () => 'connected',
    getReconnectAttempt: () => 0,
    getLastConnectedAt: () => null,
    onStateChange: () => () => {},
    notifyForeground: () => {},
    close: () => {}
  }
  return { client, calls }
}

let renderer: ReactTestRenderer | null = null
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
})

async function actionsFor(args: {
  client: RpcClient
  connState?: ConnectionState
  hostCapabilities?: string[]
  target?: Worktree
  server?: { client: RpcClient; capabilities: string[] }
  /** What the host list knows of the row's library: set when its row is linked to a task. */
  rows?: LocalTaskHostRows
}): Promise<string[]> {
  const target = args.target ?? row
  let actions: ActionSheetAction[] = []
  function Probe() {
    const link = useLocalTaskHostLinkAction({
      client: args.client,
      connState: args.connState ?? 'connected',
      hostCapabilities: args.hostCapabilities ?? [LOCAL_TASKS_RUNTIME_CAPABILITY],
      target,
      server: args.server
        ? {
            client: args.server.client,
            state: 'connected',
            gates: { hostCapabilities: args.server.capabilities }
          }
        : null
    })
    actions = link.actionsFor(target, () => {})
    return null
  }
  await act(async () => {
    renderer = create(
      createElement(
        LocalTaskHostRowsContext.Provider,
        { value: args.rows ?? null },
        createElement(Probe)
      )
    )
  })
  await act(async () => {
    await Promise.resolve()
  })
  act(() => renderer?.unmount())
  renderer = null
  return actions.map((action) => action.label)
}

describe('host screen long-press "Link to task…"', () => {
  it('is offered once the owning library is known to have a project', async () => {
    const desktop = library(2)
    expect(await actionsFor({ client: desktop.client })).toHaveLength(1)
    expect(desktop.calls).toEqual(['localTasks.status'])
    // Known to have one: the next long-press offers it without asking.
    expect(await actionsFor({ client: desktop.client })).toHaveLength(1)
    expect(desktop.calls).toEqual(['localTasks.status'])
  })

  it('is absent for a library with no project, which is asked again on the next long-press', async () => {
    const desktop = library(0)
    expect(await actionsFor({ client: desktop.client })).toEqual([])
    expect(await actionsFor({ client: desktop.client })).toEqual([])
    expect(desktop.calls).toEqual(['localTasks.status', 'localTasks.status'])
  })

  // A host too old to report `sourceHidden` is the first case above: offered.
  it('is absent while the desktop hides local tasks, and offered when it shows them', async () => {
    const hidden = library(2, true)
    expect(await actionsFor({ client: hidden.client })).toEqual([])
    const shown = library(2, false)
    expect(await actionsFor({ client: shown.client })).toHaveLength(1)
  })

  it('stays on a row already linked to a task while the desktop hides local tasks, as on the desktop', async () => {
    const libraries = createLocalTaskHostLibraries()
    libraries.set('self', {
      links: {
        workspaces: [
          {
            taskId: 't12',
            kind: 'git-worktree',
            hostId: 'local',
            instanceId: null,
            worktreeId: row.worktreeId,
            folderWorkspaceId: null,
            repoId: 'repo',
            branchSnapshot: null,
            nameSnapshot: null,
            hostLabelSnapshot: null,
            linkedVia: 'manual',
            linkedAt: 1
          }
        ],
        sessions: []
      },
      tasks: [
        {
          id: 't12',
          projectId: 'p',
          number: 12,
          ref: 'SHOP-12',
          title: 'Export API',
          description: '',
          criteria: [],
          statusId: 's',
          priority: 0,
          labels: [],
          parentId: null,
          createdAt: 0,
          updatedAt: 0,
          revision: 1
        }
      ],
      live: true,
      glyphShown: true
    })
    const hidden = library(2, true)
    const rows = { hostId: 'h', libraries, open: () => {} }
    const linked: Worktree = { ...row, hostId: 'local' }
    expect(await actionsFor({ client: hidden.client, target: linked, rows })).toHaveLength(1)
  })

  it('asks nothing of a desktop without local tasks, out of contact, or for a folder', async () => {
    const desktop = library(2)
    expect(await actionsFor({ client: desktop.client, hostCapabilities: [] })).toEqual([])
    expect(await actionsFor({ client: desktop.client, connState: 'reconnecting' })).toEqual([])
    expect(
      await actionsFor({
        client: desktop.client,
        target: { ...row, workspaceKind: 'folder-workspace', worktreeId: 'folder:f1' }
      })
    ).toEqual([])
    expect(desktop.calls).toEqual([])
  })

  it("follows a server row's own library, and skips a server too old for local tasks", async () => {
    const desktop = library(2)
    const server = library(1)
    const serverRow = { ...row, hostId: 'runtime:vm' as const }
    expect(
      await actionsFor({
        client: desktop.client,
        target: serverRow,
        server: { client: server.client, capabilities: [] }
      })
    ).toEqual([])
    expect(server.calls).toEqual([])
    expect(
      await actionsFor({
        client: desktop.client,
        target: serverRow,
        server: { client: server.client, capabilities: [LOCAL_TASKS_RUNTIME_CAPABILITY] }
      })
    ).toHaveLength(1)
    expect(server.calls).toEqual(['localTasks.status'])
    expect(desktop.calls).toEqual([])
  })
})
