import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LOCAL_TASKS_RUNTIME_CAPABILITY } from '../../../src/shared/local-tasks/local-tasks-capability'
import type { MobileRelayHost } from '../../../src/shared/mobile-relay-hosts-contract'
import type { RpcClient } from '../transport/rpc-client'
import type { LocalTaskChoice } from './local-task-choice-sheet'
import { localTasksCopy } from './local-tasks-copy'
import { LocalTaskLinkToTaskSheet } from './local-task-link-to-task-sheet'
import type { LocalTaskWorkspaceCandidate } from './local-task-workspace-candidates'

type SheetProps = { message: string | null; choices: LocalTaskChoice[] }

const relay = vi.hoisted(() => {
  const state: { hosts: readonly MobileRelayHost[] | null } = { hosts: null }
  return state
})
const sheet = vi.hoisted(() => {
  const state: { props: SheetProps | null } = { props: null }
  return state
})
vi.mock('../worktree/relay-hosts-feed', () => ({ useRelayHosts: () => relay.hosts }))
vi.mock('./local-task-choice-sheet', () => ({
  LocalTaskChoiceSheet: (props: SheetProps) => {
    sheet.props = props
    return null
  }
}))

const task = {
  id: 't12',
  projectId: 'p1',
  number: 12,
  ref: 'OPS-12',
  title: 'Rotate keys',
  statusId: 'todo',
  parentId: null,
  createdAt: 1,
  updatedAt: 1,
  revision: 1
}

// The server's own `worktree.ps`: one workspace on its SSH target `box`, one on its own machine.
const SERVER_ROWS = [
  { worktreeId: 'ops-box::/w/ssh-12', repoId: 'ops-box', hostId: 'ssh:box', displayName: 'ssh-12' },
  { worktreeId: 'ops::/w/vm-12', repoId: 'ops', displayName: 'vm-12' }
]

const RESULTS: Record<string, unknown> = {
  'status.get': { capabilities: [LOCAL_TASKS_RUNTIME_CAPABILITY] },
  'localTasks.projects.list': { projects: [] },
  'localTasks.tasks.list': { tasks: [task] },
  'localTasks.links.list': { workspaces: [], sessions: [] },
  'localTasks.links.linkWorkspace': { ok: true },
  'worktree.ps': { worktrees: SERVER_ROWS }
}

const sent: { method: string; executionHost: unknown; params: unknown }[] = []
const client: RpcClient = {
  sendRequest: async (method, params, options) => {
    sent.push({ method, executionHost: options?.envelope?.executionHost, params })
    if (!(method in RESULTS)) {
      throw new Error(`${method} is not answered in this test`)
    }
    return { id: method, ok: true, result: RESULTS[method] }
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

/** A server workspace as the paired host lists it: only `runtime:vm`, whichever host it is on. */
function listedOnServer(worktreeId: string): LocalTaskWorkspaceCandidate {
  return {
    worktreeId,
    repoId: worktreeId.split('::')[0] ?? '',
    hostId: 'runtime:vm',
    displayName: worktreeId,
    branch: '',
    instanceId: null,
    folderWorkspaceId: null
  }
}

function server(state: MobileRelayHost['relay']): MobileRelayHost {
  return { hostId: 'runtime:vm', label: 'build-vm', health: 'available', relay: state }
}

let renderer: ReactTestRenderer | null = null
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
  sent.length = 0
})

async function open(target: LocalTaskWorkspaceCandidate) {
  const element = createElement(LocalTaskLinkToTaskSheet, {
    target,
    hostLabel: '',
    client,
    onClose: () => {}
  })
  await act(async () => {
    if (renderer) {
      renderer.update(element)
    } else {
      renderer = create(element)
    }
  })
}

/** Links the open workspace to the one task and returns the host the link records. */
async function linkedHost(): Promise<unknown> {
  await act(async () => sheet.props?.choices[0]?.onPress())
  const write = sent.find((entry) => entry.method === 'localTasks.links.linkWorkspace')
  return typeof write?.params === 'object' && write.params !== null && 'hostId' in write.params
    ? write.params.hostId
    : undefined
}

describe('"Link to task…" on a server workspace', () => {
  it('reads nothing from a server the paired host cannot relay to, and reads once it can', async () => {
    relay.hosts = [server('unavailable')]
    await open(listedOnServer('ops::/w/vm-12'))
    expect(sent).toEqual([])
    expect(sheet.props?.message).toBe(localTasksCopy().work.hostOffline('build-vm'))

    relay.hosts = [server('ready')]
    await open(listedOnServer('ops::/w/vm-12'))
    expect(sent).toContainEqual(expect.objectContaining({ method: 'status.get' }))
    expect(sent).toContainEqual(
      expect.objectContaining({ method: 'worktree.ps', executionHost: 'runtime:vm' })
    )
  })

  it("records the server's own host: its SSH target for a workspace there, local otherwise", async () => {
    relay.hosts = [server('ready')]
    await open(listedOnServer('ops-box::/w/ssh-12'))
    expect(await linkedHost()).toBe('ssh:box')

    act(() => renderer?.unmount())
    renderer = null
    sent.length = 0
    await open(listedOnServer('ops::/w/vm-12'))
    expect(await linkedHost()).toBe('local')
  })

  it('offers no task for a workspace whose host is not known, rather than guessing local', async () => {
    relay.hosts = [server('ready')]
    await open(listedOnServer('ops::/w/gone'))
    expect(sheet.props?.choices).toEqual([])
    expect(sheet.props?.message).toBe(localTasksCopy().work.workspaceNotListed)

    // The session strip's fallback on the paired host when its own list does not name the row.
    await open({ ...listedOnServer('ops::/w/vm-12'), hostId: '' })
    expect(sheet.props?.choices).toEqual([])
    expect(sheet.props?.message).toBe(localTasksCopy().work.workspaceNotListed)
  })
})
