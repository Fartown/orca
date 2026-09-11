import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FolderWorkspace } from '../../../../shared/folder-workspace-types'
import type { ProjectGroup } from '../../../../shared/project-group-types'
import type { Repo } from '../../../../shared/repo-types'
import type { SshConnectionState } from '../../../../shared/ssh-types'
import { folderWorkspaceKey } from '../../../../shared/workspace-scope'
import { useAppStore } from '@/store'
import {
  createTabEntryAbsolutePathHostPolicySelector,
  isSameTabEntryAbsolutePathHost,
  resolveTabEntryAbsolutePathHostPolicy,
  toTabEntryAbsolutePathContext
} from './absolute-path-host-policy'

vi.mock('@/lib/renderer-app-platform', () => ({
  getRendererAppPlatform: () => 'win32'
}))

const initialState = useAppStore.getInitialState()
const localWorktreeId = 'repo-local::/Users/me/repo'
const sshWorktreeId = 'repo-ssh::/home/neil/repo'

function makeRepo(overrides: Partial<Repo> & { id: string }): Repo {
  return {
    path: '/Users/me/repo',
    displayName: 'repo',
    badgeColor: '#000',
    addedAt: 0,
    ...overrides
  }
}

function makeFolderWorkspace(overrides: Partial<FolderWorkspace> = {}): FolderWorkspace {
  return {
    id: 'folder-local',
    projectGroupId: 'group-local',
    name: 'Local folder',
    folderPath: '/Users/me/folder',
    linkedTask: null,
    comment: '',
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides
  }
}

function makeProjectGroup(overrides: Partial<ProjectGroup> = {}): ProjectGroup {
  return {
    id: 'group-local',
    name: 'Local group',
    parentPath: null,
    parentGroupId: null,
    createdFrom: 'manual',
    tabOrder: 0,
    isCollapsed: false,
    color: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides
  }
}

function connectedSsh(targetId: string): Map<string, SshConnectionState> {
  return new Map([
    [
      targetId,
      {
        targetId,
        status: 'connected',
        error: null,
        reconnectAttempt: 0,
        connectionGeneration: 1
      } as SshConnectionState
    ]
  ])
}

function setLocalWorktree(): void {
  useAppStore.setState({
    repos: [makeRepo({ id: 'repo-local' })],
    worktreesByRepo: {
      'repo-local': [
        {
          id: localWorktreeId,
          repoId: 'repo-local',
          path: '/Users/me/repo',
          hostId: 'local'
        } as never
      ]
    },
    runtimeEnvironmentCatalogHydrated: true,
    runtimeEnvironments: [],
    removedRuntimeEnvironmentIds: new Set(),
    settings: { activeRuntimeEnvironmentId: null } as never
  })
}

function setSshWorktree(sshConnectionStates: Map<string, SshConnectionState>): void {
  useAppStore.setState({
    repos: [makeRepo({ id: 'repo-ssh', path: '/home/neil/repo', connectionId: 'ssh-1' })],
    worktreesByRepo: {
      'repo-ssh': [{ id: sshWorktreeId, repoId: 'repo-ssh', path: '/home/neil/repo' } as never]
    },
    runtimeEnvironmentCatalogHydrated: true,
    runtimeEnvironments: [],
    removedRuntimeEnvironmentIds: new Set(),
    sshConnectionStates,
    settings: { activeRuntimeEnvironmentId: null } as never
  })
}

describe('resolveTabEntryAbsolutePathHostPolicy', () => {
  afterEach(() => {
    useAppStore.setState(initialState, true)
  })

  it('blocks unknown worktrees', () => {
    useAppStore.setState({ repos: [], worktreesByRepo: {} })

    expect(resolveTabEntryAbsolutePathHostPolicy(useAppStore.getState(), 'repo-x::/x')).toEqual({
      kind: 'blocked',
      reason: 'unknown-worktree'
    })
  })

  it('resolves local worktrees to the client platform', () => {
    setLocalWorktree()

    expect(resolveTabEntryAbsolutePathHostPolicy(useAppStore.getState(), localWorktreeId)).toEqual({
      kind: 'local',
      pathPlatform: 'windows'
    })
  })

  it('blocks SSH worktrees until the connection publishes a generation', () => {
    setSshWorktree(new Map())

    expect(resolveTabEntryAbsolutePathHostPolicy(useAppStore.getState(), sshWorktreeId)).toEqual({
      kind: 'blocked',
      reason: 'unresolved'
    })
  })

  it('resolves connected SSH worktrees to a POSIX ssh policy regardless of client platform', () => {
    setSshWorktree(connectedSsh('ssh-1'))

    expect(resolveTabEntryAbsolutePathHostPolicy(useAppStore.getState(), sshWorktreeId)).toEqual({
      kind: 'ssh',
      connectionId: 'ssh-1',
      pathPlatform: 'posix'
    })
  })

  it('resolves paired-runtime worktrees to a worktree-scoped runtime policy', () => {
    useAppStore.setState({
      repos: [makeRepo({ id: 'repo-local' })],
      worktreesByRepo: {
        'repo-local': [
          {
            id: localWorktreeId,
            repoId: 'repo-local',
            path: '/Users/me/repo',
            hostId: 'runtime:hub-a',
            runtimeOwnerEnvironmentId: 'hub-a'
          } as never
        ]
      },
      runtimeEnvironmentCatalogHydrated: true,
      runtimeEnvironments: [{ id: 'hub-a' } as never],
      removedRuntimeEnvironmentIds: new Set(),
      settings: { activeRuntimeEnvironmentId: 'hub-a' } as never
    })

    expect(resolveTabEntryAbsolutePathHostPolicy(useAppStore.getState(), localWorktreeId)).toEqual({
      kind: 'runtime',
      environmentId: 'hub-a',
      worktreePath: '/Users/me/repo',
      pathPlatform: 'posix'
    })
  })

  it('blocks conflicting local and paired-runtime ownership', () => {
    useAppStore.setState({
      repos: [makeRepo({ id: 'repo-local' }), makeRepo({ id: 'repo-runtime' })],
      worktreesByRepo: {
        'repo-local': [
          {
            id: localWorktreeId,
            repoId: 'repo-local',
            path: '/Users/me/repo',
            hostId: 'local'
          } as never
        ],
        'repo-runtime': [
          {
            id: localWorktreeId,
            repoId: 'repo-runtime',
            path: '/Users/me/repo',
            hostId: 'runtime:hub-a',
            runtimeOwnerEnvironmentId: 'hub-a'
          } as never
        ]
      },
      runtimeEnvironmentCatalogHydrated: true,
      runtimeEnvironments: [{ id: 'hub-a' } as never],
      removedRuntimeEnvironmentIds: new Set(),
      settings: { activeRuntimeEnvironmentId: null } as never
    })

    expect(
      resolveTabEntryAbsolutePathHostPolicy(useAppStore.getState(), localWorktreeId)
    ).toMatchObject({ kind: 'blocked' })
  })

  it('resolves local folder workspaces to local', () => {
    const folderWorkspace = makeFolderWorkspace()
    useAppStore.setState({
      folderWorkspaces: [folderWorkspace],
      projectGroups: [makeProjectGroup()],
      repos: [],
      settings: { activeRuntimeEnvironmentId: null } as never
    })

    expect(
      resolveTabEntryAbsolutePathHostPolicy(
        useAppStore.getState(),
        folderWorkspaceKey(folderWorkspace.id)
      )
    ).toEqual({ kind: 'local', pathPlatform: 'windows' })
  })

  it('resolves connected SSH folder workspaces to ssh', () => {
    const folderWorkspace = makeFolderWorkspace({
      id: 'folder-ssh',
      folderPath: '/home/me/folder',
      connectionId: 'ssh-1'
    })
    useAppStore.setState({
      folderWorkspaces: [folderWorkspace],
      projectGroups: [makeProjectGroup()],
      repos: [],
      sshConnectionStates: connectedSsh('ssh-1'),
      settings: { activeRuntimeEnvironmentId: null } as never
    })

    expect(
      resolveTabEntryAbsolutePathHostPolicy(
        useAppStore.getState(),
        folderWorkspaceKey(folderWorkspace.id)
      )
    ).toEqual({ kind: 'ssh', connectionId: 'ssh-1', pathPlatform: 'posix' })
  })

  it('blocks folder workspaces with mixed local and SSH repo ownership', () => {
    const folderWorkspace = makeFolderWorkspace()
    useAppStore.setState({
      folderWorkspaces: [folderWorkspace],
      projectGroups: [makeProjectGroup()],
      repos: [
        makeRepo({
          id: 'local-child',
          path: '/Users/me/folder/local',
          projectGroupId: 'group-local'
        }),
        makeRepo({
          id: 'ssh-child',
          path: '/Users/me/folder/remote',
          projectGroupId: 'group-local',
          connectionId: 'ssh-1'
        })
      ],
      sshConnectionStates: connectedSsh('ssh-1')
    })

    expect(
      resolveTabEntryAbsolutePathHostPolicy(
        useAppStore.getState(),
        folderWorkspaceKey(folderWorkspace.id)
      )
    ).toEqual({ kind: 'blocked', reason: 'unresolved' })
  })

  it('blocks folder workspaces until their project group owner is hydrated', () => {
    const folderWorkspace = makeFolderWorkspace()
    useAppStore.setState({ folderWorkspaces: [folderWorkspace], projectGroups: [], repos: [] })

    expect(
      resolveTabEntryAbsolutePathHostPolicy(
        useAppStore.getState(),
        folderWorkspaceKey(folderWorkspace.id)
      )
    ).toEqual({ kind: 'blocked', reason: 'unresolved' })
  })
})

describe('isSameTabEntryAbsolutePathHost', () => {
  it('matches only the same host identity', () => {
    const ssh1 = { kind: 'ssh', connectionId: 'ssh-1', pathPlatform: 'posix' } as const
    const ssh2 = { kind: 'ssh', connectionId: 'ssh-2', pathPlatform: 'posix' } as const
    const local = { kind: 'local', pathPlatform: 'posix' } as const
    const runtimeA = {
      kind: 'runtime',
      environmentId: 'hub-a',
      worktreePath: '/repo',
      pathPlatform: 'posix'
    } as const
    const blocked = { kind: 'blocked', reason: 'unresolved' } as const

    expect(isSameTabEntryAbsolutePathHost(ssh1, ssh1)).toBe(true)
    expect(isSameTabEntryAbsolutePathHost(ssh1, ssh2)).toBe(false)
    expect(isSameTabEntryAbsolutePathHost(ssh1, local)).toBe(false)
    expect(isSameTabEntryAbsolutePathHost(local, { kind: 'local', pathPlatform: 'windows' })).toBe(
      true
    )
    expect(isSameTabEntryAbsolutePathHost(runtimeA, { ...runtimeA, environmentId: 'hub-b' })).toBe(
      false
    )
    expect(isSameTabEntryAbsolutePathHost(local, blocked)).toBe(false)
    expect(isSameTabEntryAbsolutePathHost(blocked, blocked)).toBe(false)
  })
})

describe('toTabEntryAbsolutePathContext', () => {
  it('maps policies onto the classifier context', () => {
    expect(toTabEntryAbsolutePathContext({ kind: 'blocked', reason: 'skipped' })).toEqual({
      allowAbsolutePaths: false,
      localPlatform: 'windows'
    })
    expect(
      toTabEntryAbsolutePathContext({ kind: 'ssh', connectionId: 'ssh-1', pathPlatform: 'posix' })
    ).toEqual({ allowAbsolutePaths: true, localPlatform: 'posix' })
    expect(
      toTabEntryAbsolutePathContext({
        kind: 'runtime',
        environmentId: 'hub-a',
        worktreePath: '/repo',
        pathPlatform: 'posix'
      })
    ).toEqual({
      allowAbsolutePaths: true,
      localPlatform: 'posix',
      absolutePathScope: { worktreePath: '/repo' }
    })
  })
})

describe('createTabEntryAbsolutePathHostPolicySelector', () => {
  afterEach(() => {
    useAppStore.setState(initialState, true)
  })

  it('skips owner resolution and returns a stable blocked policy until asked', () => {
    const state = useAppStore.getState()
    const getKnownWorktreeById = vi.fn(state.getKnownWorktreeById)
    const selector = createTabEntryAbsolutePathHostPolicySelector(localWorktreeId, { skip: true })

    const first = selector({ ...state, getKnownWorktreeById })
    expect(first).toEqual({ kind: 'blocked', reason: 'skipped' })
    expect(selector({ ...state, getKnownWorktreeById })).toBe(first)
    expect(getKnownWorktreeById).not.toHaveBeenCalled()
  })

  it('does not repeat owner resolution for unrelated store writes', () => {
    setSshWorktree(connectedSsh('ssh-1'))
    const state = useAppStore.getState()
    const getKnownWorktreeById = vi.fn(state.getKnownWorktreeById)
    const selector = createTabEntryAbsolutePathHostPolicySelector(sshWorktreeId)
    const selectedState = { ...state, getKnownWorktreeById }

    const first = selector(selectedState)
    expect(first).toMatchObject({ kind: 'ssh', connectionId: 'ssh-1' })
    for (let index = 0; index < 1_000; index += 1) {
      expect(selector({ ...selectedState, pendingToastCount: index } as never)).toBe(first)
    }
    expect(getKnownWorktreeById).toHaveBeenCalledTimes(1)
  })

  it('recomputes when an ownership-causal slice changes', () => {
    setSshWorktree(connectedSsh('ssh-1'))
    const state = useAppStore.getState()
    const selector = createTabEntryAbsolutePathHostPolicySelector(sshWorktreeId)

    expect(selector(state)).toMatchObject({ kind: 'ssh' })
    expect(selector({ ...state, sshConnectionStates: new Map() })).toEqual({
      kind: 'blocked',
      reason: 'unresolved'
    })
  })
})
