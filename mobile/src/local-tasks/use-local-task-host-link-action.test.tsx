import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LOCAL_TASKS_RUNTIME_CAPABILITY } from '../../../src/shared/local-tasks/local-tasks-capability'
import type { ActionSheetAction } from '../components/ActionSheetModal'
import type { RpcClient } from '../transport/rpc-client'
import type { ConnectionState, RpcResponse } from '../transport/types'
import type { Worktree } from '../worktree/workspace-list-types'
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
function library(projectCount: number) {
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
          projectCount
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
    renderer = create(createElement(Probe))
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
