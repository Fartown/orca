import { createElement, useState } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it } from 'vitest'
import { LOCAL_TASKS_RUNTIME_CAPABILITY } from '../../../src/shared/local-tasks/local-tasks-capability'
import type { LocalTask, LocalTaskProject } from '../../../src/shared/local-tasks/local-task-types'
import type { SmartNameMode } from '../../../src/shared/new-workspace/smart-workspace-source-results'
import type { MobileWorkspaceRepo } from '../components/new-worktree-modal-types'
import { resolveAvailableSmartModes } from '../tasks/mobile-smart-source-modes'
import { scopeRpcClientToExecutionHost } from '../transport/execution-host-scoped-rpc-client'
import { FakeSession } from '../transport/mobile-endpoint-supervisor-test-fakes'
import type { RpcResponse } from '../transport/types'
import { localTasksCopy } from './local-tasks-copy'
import {
  useLocalTaskCreateSource,
  type LocalTaskCreateSource
} from './use-local-task-create-source'
import {
  useLocalTaskCreateSourceTab,
  type LocalTaskCreateSourceTab
} from './use-local-task-create-source-tab'

const project: LocalTaskProject = {
  id: 'project-shop',
  name: 'Shop',
  prefix: 'SHOP',
  aliases: [],
  repos: [],
  defaultRepoId: null,
  lastExecutionHostId: null,
  rules: { startMovesToInProgress: true, prMergedCompletes: true },
  statuses: [
    {
      id: 'todo',
      projectId: 'project-shop',
      category: 'unstarted',
      name: 'Todo',
      color: 'gray',
      position: 0
    }
  ],
  createdAt: 1,
  updatedAt: 1,
  revision: 1
}

function task(number: number, title: string): LocalTask {
  return {
    id: `task-${number}`,
    projectId: project.id,
    number,
    ref: `SHOP-${number}`,
    title,
    description: '',
    criteria: [],
    statusId: 'todo',
    priority: 0,
    labels: [],
    parentId: null,
    createdAt: number,
    updatedAt: number,
    revision: 1
  }
}

const tasks = [task(12, 'Export orders as CSV'), task(3, 'Fix checkout rounding')]

type Library = {
  capabilities?: string[]
  projectCount?: number
  sourceHidden?: boolean
}

/** One Orca's answers; `methods` lists every call it got, in order. */
function orca(library: Library = {}) {
  const host = new FakeSession('connected')
  const methods: string[] = []
  const answer = (method: string): unknown => {
    switch (method) {
      case 'status.get':
        return { capabilities: library.capabilities ?? [LOCAL_TASKS_RUNTIME_CAPABILITY] }
      case 'localTasks.status':
        return {
          taskHost: true,
          state: 'ready',
          reason: null,
          revision: 1,
          taskHostId: 'library-1',
          projectCount: library.projectCount ?? 1,
          ...(library.sourceHidden === undefined ? {} : { sourceHidden: library.sourceHidden })
        }
      case 'localTasks.projects.list':
        return { projects: [project] }
      case 'localTasks.tasks.list':
        return { tasks }
      case 'localTasks.links.list':
        return {
          workspaces: [
            {
              taskId: 'task-3',
              hostId: 'local',
              kind: 'git-worktree',
              instanceId: null,
              worktreeId: 'repo-1::/w/shop-3',
              folderWorkspaceId: null,
              repoId: 'repo-1',
              branchSnapshot: null,
              nameSnapshot: 'shop-3',
              hostLabelSnapshot: null,
              linkedVia: 'start',
              linkedAt: 1
            }
          ],
          sessions: []
        }
      default:
        throw new Error(`unexpected ${method}`)
    }
  }
  host.sendRequest.mockImplementation(async (method: string): Promise<RpcResponse> => {
    methods.push(method)
    return { id: method, ok: true, result: answer(method) }
  })
  return { host, methods }
}

const localRepo: MobileWorkspaceRepo = { id: 'repo-1', displayName: 'shop', path: '/src/shop' }

type Seen = {
  source: LocalTaskCreateSource
  tab: LocalTaskCreateSourceTab
  name: string
}

function Harness(props: {
  desktopClient: FakeSession
  client: FakeSession | ReturnType<typeof scopeRpcClientToExecutionHost>
  repo: MobileWorkspaceRepo
  mode: SmartNameMode
  seen: { current: Seen | null }
}) {
  const [name, setName] = useState('')
  const source = useLocalTaskCreateSource({
    visible: true,
    desktopClient: props.desktopClient,
    client: props.client,
    repo: props.repo,
    repoIsGit: props.repo.kind !== 'folder',
    hostLabelById: new Map([['local', 'MacBook']]),
    hostPlatform: 'darwin',
    composer: { name, setName, handleClearSmartNameSelection: () => {} }
  })
  const tab = useLocalTaskCreateSourceTab(source, props.mode, name)
  props.seen.current = { source, tab, name }
  return null
}

let renderer: ReactTestRenderer | null = null
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
})

async function settle(): Promise<void> {
  for (let turn = 0; turn < 5; turn += 1) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

async function mount(
  props: Omit<Parameters<typeof Harness>[0], 'seen' | 'mode'> & { mode?: SmartNameMode }
): Promise<{ current: Seen | null }> {
  const seen: { current: Seen | null } = { current: null }
  await act(async () => {
    renderer = create(createElement(Harness, { mode: 'smart', ...props, seen }))
  })
  await settle()
  return seen
}

const offeredModes = (source: LocalTaskCreateSource) =>
  resolveAvailableSmartModes({
    textOnly: false,
    tasksSupported: true,
    hasRepo: true,
    githubAvailable: true,
    gitlabAvailable: false,
    linearAvailable: false,
    jiraAvailable: false,
    localTaskSourceOffered: source.offered
  })

describe('Create From → Local on the phone', () => {
  it('sits right after Smart for a git repo whose library has a project and shows Local', async () => {
    const { host } = orca()
    const seen = await mount({ desktopClient: host, client: host, repo: localRepo })
    expect(offeredModes(seen.current!.source)).toEqual([
      'smart',
      'local',
      'github',
      'branches',
      'text'
    ])
  })

  it.each([
    ['an Orca older than local tasks', { capabilities: [] }, false],
    ['Local hidden in Task sources', { sourceHidden: true }, true],
    ['a library without projects', { projectCount: 0 }, true]
  ])('is not offered for %s, and never reads its tasks', async (_case, library, asksStatus) => {
    const { host, methods } = orca(library)
    const seen = await mount({ desktopClient: host, client: host, repo: localRepo, mode: 'local' })
    expect(seen.current!.source.offered).toBe(false)
    expect(seen.current!.tab.active).toBe(false)
    expect(methods.includes('localTasks.status')).toBe(asksStatus)
    expect(
      methods.filter((method) => method.startsWith('localTasks.') && method !== 'localTasks.status')
    ).toEqual([])
  })

  it('is not offered for a folder project, which asks nothing', async () => {
    const { host, methods } = orca()
    const seen = await mount({
      desktopClient: host,
      client: host,
      repo: { ...localRepo, kind: 'folder' }
    })
    expect(seen.current!.source.offered).toBe(false)
    expect(methods).toEqual([])
  })

  it("is not offered on a server when the paired Orca can't relay its task calls", async () => {
    const desktop = orca({ capabilities: [] })
    const server = scopeRpcClientToExecutionHost(desktop.host, 'runtime:env-1')
    const seen = await mount({
      desktopClient: desktop.host,
      client: server,
      repo: { ...localRepo, executionHostId: 'runtime:env-1' }
    })
    expect(seen.current!.source.offered).toBe(false)
    expect(desktop.methods.filter((method) => method.startsWith('localTasks.'))).toEqual([])
  })

  it('leads rows with the title, greys a task that has a workspace, and picking one names the workspace', async () => {
    const { host } = orca()
    const seen = await mount({ desktopClient: host, client: host, repo: localRepo, mode: 'local' })
    const rows = seen.current!.tab.rows
    expect(rows.map((row) => [row.task?.title, row.task?.ref, row.disabled, row.note])).toEqual([
      ['Export orders as CSV', 'SHOP-12', false, null],
      ['Fix checkout rounding', 'SHOP-3', true, localTasksCopy().work.hasWorkspace('shop-3')]
    ])
    expect(seen.current!.tab.select(rows[1]!)).toBe(false)
    await act(async () => {
      expect(seen.current!.tab.select(rows[0]!)).toBe(true)
    })
    expect(seen.current!.source.picked?.id).toBe('task-12')
    expect(seen.current!.name).toBe('shop-12-export-orders-as-csv')
    expect(seen.current!.source.create).not.toBeNull()
  })

  it('out of contact keeps the last read greyed behind the reason, and reads again only once contact is back', async () => {
    const { host, methods } = orca()
    const seen = await mount({ desktopClient: host, client: host, repo: localRepo, mode: 'local' })
    const reads = () => methods.filter((method) => method === 'localTasks.tasks.list').length
    expect(reads()).toBe(1)

    await act(async () => {
      host.publishState('disconnected')
    })
    await settle()
    const offline = seen.current!.tab.rows
    expect(seen.current!.source.offered).toBe(true)
    expect(offline[0]).toMatchObject({
      task: null,
      note: expect.stringContaining('MacBook is not connected')
    })
    expect(offline.slice(1).map((row) => [row.task?.ref, row.disabled])).toEqual([
      ['SHOP-12', true],
      ['SHOP-3', true]
    ])
    expect(reads()).toBe(1)

    await act(async () => {
      host.publishState('connected')
    })
    await settle()
    expect(reads()).toBe(2)
    expect(seen.current!.tab.rows[0]?.task?.ref).toBe('SHOP-12')
  })
})
