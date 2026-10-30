import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultWorkspaceSession } from '../../../shared/constants'
import type { Repo } from '../../../shared/repo-types'
import { getProjectGroupingForRepo } from '../../../shared/project-section-grouping'
import { createTestStore, makeOpenFile } from '../store/slices/store-test-helpers'
import { buildRuntimeSessionPlaceholders } from '../store/terminals/workspace-terminal-placeholders'
import { reconcileRestoredWorkspaceCatalog } from './restored-workspace-catalog'
import {
  createCompatibleRuntimeStatusResponseIfNeeded,
  type RuntimeEnvironmentCallRequest
} from '../runtime/runtime-compatibility-test-fixture'
import { clearRuntimeCompatibilityCacheForTests } from '../runtime/runtime-rpc-client'

const host = 'runtime:host' as const
const emptyId = 'removed::/srv/project/empty'
const editorId = 'removed::/srv/project'
const owners = { [editorId]: host, [emptyId]: host }
const registered: Repo = {
  id: 'registered',
  path: '/srv/registered',
  displayName: 'Registered',
  badgeColor: '#737373',
  addedAt: 1,
  executionHostId: host
}

function restoredStore() {
  const store = createTestStore()
  store.setState({
    ...buildRuntimeSessionPlaceholders({
      repos: [],
      worktreesByRepo: {},
      runtimeHostIdByWorkspaceSessionKey: owners
    }),
    restoredRuntimeHostIdByWorkspaceSessionKey: owners,
    openFiles: [makeOpenFile({ id: 'draft', worktreeId: editorId, isDirty: true })],
    editorDrafts: { draft: 'unsaved content' }
  })
  return store
}

beforeEach(() => {
  clearRuntimeCompatibilityCacheForTests()
  vi.stubGlobal('window', {
    api: {
      runtimeEnvironments: {
        call: vi.fn(async (args: RuntimeEnvironmentCallRequest) => {
          return (
            createCompatibleRuntimeStatusResponseIfNeeded(args) ?? {
              id: 'catalog',
              ok: true,
              result:
                args.method === 'repo.list'
                  ? { repos: [registered] }
                  : { projects: [], setups: [], settings: {} },
              _meta: { runtimeId: 'host-runtime' }
            }
          )
        })
      }
    }
  })
})

describe('restored workspace catalog settlement', () => {
  it('does not recreate history-only workspaces during actual session hydration', () => {
    const store = createTestStore()
    store.getState().hydrateWorkspaceSession(
      {
        ...getDefaultWorkspaceSession(),
        activeTabTypeByWorktree: { [emptyId]: 'terminal' },
        lastVisitedAtByWorktreeId: { [emptyId]: 1 }
      },
      { runtimeHostIdByWorkspaceSessionKey: { [emptyId]: host } }
    )
    expect(store.getState().repos).toEqual([])
    expect(store.getState().worktreesByRepo).toEqual({})
  })

  it('removes empty restored rows but keeps named recovery content and its dirty draft', async () => {
    const store = restoredStore()
    await store.getState().fetchRuntimeEnvironmentRepos('host')
    const state = store.getState()
    expect(state.worktreesByRepo.removed.map((row) => row.id)).toEqual([editorId])
    const target = getProjectGroupingForRepo(
      'removed',
      new Map(state.repos.map((repo) => [repo.id, repo])),
      null
    )
    expect(target.label).toBe('project')
    expect(target.repo?.executionHostId).toBe(host)
    expect(state.openFiles[0].isDirty).toBe(true)
    expect(state.editorDrafts.draft).toBe('unsaved content')
    store.setState({ openFiles: [] })
    await store.getState().fetchRuntimeEnvironmentRepos('host')
    expect(store.getState().worktreesByRepo.removed).toBeUndefined()
    expect(store.getState().repos.map((repo) => repo.id)).toEqual(['registered'])
  })

  it('retains the existing project name, metadata and repo object for recovery content', () => {
    const store = restoredStore()
    const repo = {
      ...store.getState().repos[0],
      displayName: 'My custom project',
      kind: 'folder' as const
    }
    store.setState({ repos: [repo] })
    const result = reconcileRestoredWorkspaceCatalog(store.getState(), [], host)
    expect(result.repos[0]).toBe(repo)
    expect(result.worktreesByRepo.removed.map((row) => row.id)).toEqual([editorId])
  })

  it('keeps the previous state when the host catalog fails', async () => {
    const store = restoredStore()
    const before = store.getState()
    vi.mocked(window.api.runtimeEnvironments.call).mockRejectedValue(new Error('out of contact'))
    await store.getState().fetchRuntimeEnvironmentRepos('host')
    expect(store.getState().repos).toBe(before.repos)
    expect(store.getState().worktreesByRepo).toBe(before.worktreesByRepo)
    expect(store.getState().editorDrafts).toBe(before.editorDrafts)
  })

  it('does not remove another host twin, registered rows or local and SSH ownership', () => {
    const store = restoredStore()
    const original = store.getState().worktreesByRepo.removed[0]
    const twin = { ...original, hostId: 'runtime:other' as const }
    const ssh = { ...original, hostId: 'ssh:direct' as const }
    store.setState({ worktreesByRepo: { removed: [original, twin, ssh] }, openFiles: [] })
    const result = reconcileRestoredWorkspaceCatalog(store.getState(), [], host)
    expect(result.worktreesByRepo.removed).toEqual([twin, ssh])
    const local = reconcileRestoredWorkspaceCatalog(store.getState(), [], 'local')
    expect(local.worktreesByRepo).toBe(store.getState().worktreesByRepo)
    const retained = reconcileRestoredWorkspaceCatalog(
      store.getState(),
      [{ ...registered, id: 'removed' }],
      host
    )
    expect(retained.worktreesByRepo).toBe(store.getState().worktreesByRepo)
  })
})
