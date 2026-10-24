// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../../shared/repo-types'
import type { ProjectGroup } from '../../../shared/project-group-types'
import { projectHostSetupProjectionFromRepos } from '../../../shared/project-host-setup-projection'
import { getSidebarRowRevealAncestorKeys } from '../components/sidebar/worktree-list/navigation/reveal-ancestors'
import { resolveSidebarNameReveal, resolveSidebarProjectNameRevealKey } from './sidebar-name-reveal'
import { resolveProjectGroupHeaderColor } from '../components/sidebar/project-header-color'
import { useSidebarRevealRequests } from '../components/sidebar/worktree-list/navigation/use-reveal-requests'

const state = vi.hoisted(() => ({
  setGroupBy: vi.fn(),
  pendingRevealSidebarRow: { rowKey: 'sidebar-name:workspace' },
  revealSidebarRow: vi.fn(),
  revealWorktreeInSidebar: vi.fn()
}))
vi.mock('@/store', () => ({
  useAppStore: (selector: (value: typeof state) => unknown) => selector(state)
}))
vi.mock('@/components/confirmation-dialog-context', () => ({
  useConfirmationDialog: () => vi.fn()
}))
globalThis.IS_REACT_ACT_ENVIRONMENT = true

function Host({ mode }: { mode: Parameters<typeof useSidebarRevealRequests>[0]['groupBy'] }) {
  useSidebarRevealRequests({
    groupBy: mode,
    renderedSidebarRowKeys: new Set(),
    visibleWorktrees: [],
    visibleFolderWorkspaces: [],
    currentSidebarWorktreeId: null,
    currentSidebarExecutionHostId: null,
    worktreeMap: new Map(),
    worktrees: [],
    folderWorkspaces: [],
    hasFilters: false,
    revealWorkspaceFilters: vi.fn()
  })
  return null
}

function group(id: string, parentGroupId: string | null): ProjectGroup {
  return {
    id,
    name: id,
    parentGroupId,
    parentPath: null,
    createdFrom: 'migration',
    tabOrder: 0,
    isCollapsed: false,
    color: null,
    createdAt: 1,
    updatedAt: 1
  }
}

describe('display-name header reveal', () => {
  it.each(['none', 'workspace-status', 'pr-status'] as const)(
    'uses the existing project-view switch from %s',
    async (mode) => {
      state.setGroupBy.mockClear()
      const container = document.createElement('div')
      const root = createRoot(container)
      try {
        await act(async () => root.render(<Host mode={mode} />))
        expect(state.setGroupBy).toHaveBeenCalledExactlyOnceWith('repo')
      } finally {
        await act(async () => root.unmount())
      }
    }
  )

  it('resolves only the original manual-group ancestors of the displayed members', () => {
    const repos: Repo[] = ['a', 'b', 'other'].map((id) => ({
      id,
      path: `/projects/${id}`,
      displayName: 'workspace',
      kind: 'folder',
      executionHostId: id === 'b' ? 'ssh:mini' : 'local',
      projectGroupId: id === 'other' ? 'outside' : 'child',
      badgeColor: '#737373',
      addedAt: 1
    }))
    const projection = projectHostSetupProjectionFromRepos(repos)
    const args = {
      rowKey: 'sidebar-name:workspace::group:child',
      repoMap: new Map(repos.map((repo) => [repo.id, repo])),
      projectGroups: [group('parent', null), group('child', 'parent'), group('outside', null)],
      projectGrouping: { projects: projection.projects, projectHostSetups: projection.setups }
    }
    expect(getSidebarRowRevealAncestorKeys(args)).toEqual([
      'project-group:parent',
      'project-group:child'
    ])
    const sameHostRepos = repos.map((repo) => ({ ...repo, executionHostId: 'local' as const }))
    const sameHostProjection = projectHostSetupProjectionFromRepos(sameHostRepos)
    expect(
      getSidebarRowRevealAncestorKeys({
        ...args,
        rowKey: 'sidebar-name:workspace::group:child::host:local',
        repoMap: new Map(sameHostRepos.map((repo) => [repo.id, repo])),
        projectGrouping: {
          projects: sameHostProjection.projects,
          projectHostSetups: sameHostProjection.setups
        }
      })
    ).toEqual(['project-group:parent', 'project-group:child'])

    expect(getSidebarRowRevealAncestorKeys({ ...args, rowKey: 'sidebar-name:gone' })).toEqual([])
    expect(getSidebarRowRevealAncestorKeys({ ...args, projectGrouping: undefined })).toEqual([])
    expect(getSidebarRowRevealAncestorKeys({ ...args, rowKey: 'project:repo:other' })).toEqual([
      'project-group:outside'
    ])
  })

  it('normalizes native project targets only to a section present in the current plan', () => {
    const repos: Repo[] = ['a', 'b', 'remote'].map((id) => ({
      id,
      path: `/projects/${id}`,
      displayName: 'workspace',
      kind: 'folder',
      executionHostId: id === 'remote' ? 'ssh:mini' : 'local',
      badgeColor: '#123456',
      addedAt: 1
    }))
    const projection = projectHostSetupProjectionFromRepos(repos)
    const model = { projects: projection.projects, projectHostSetups: projection.setups }
    const repoMap = new Map(repos.map((repo) => [repo.id, repo]))
    const combined = new Map([['sidebar-name:workspace', []]])
    const request = { rowKey: 'project:repo:a', behavior: 'smooth' }
    expect(resolveSidebarNameReveal(request, { sectionKeys: combined, repoMap, model })).toEqual({
      ...request,
      rowKey: 'sidebar-name:workspace'
    })
    expect(resolveSidebarNameReveal(null, { sectionKeys: combined, repoMap, model })).toBeNull()
    expect(
      resolveSidebarNameReveal(request, {
        sectionKeys: new Map([[request.rowKey, []]]),
        repoMap,
        model
      })
    ).toBe(request)
    const hostView = new Map([
      ['sidebar-name:workspace::host:local', []],
      ['project:repo:remote', []]
    ])
    expect(resolveSidebarProjectNameRevealKey('project:repo:a', combined, repoMap, model)).toBe(
      'sidebar-name:workspace'
    )
    expect(resolveSidebarProjectNameRevealKey('project:repo:a', hostView, repoMap, model)).toBe(
      'sidebar-name:workspace::host:local'
    )
    expect(
      resolveSidebarProjectNameRevealKey('project:repo:remote', hostView, repoMap, model)
    ).toBe('project:repo:remote')
    expect(resolveSidebarProjectNameRevealKey('project:repo:a', new Map(), repoMap, model)).toBe(
      'project:repo:a'
    )
    expect(
      resolveProjectGroupHeaderColor({
        groupBy: 'repo',
        headerKey: 'sidebar-name:workspace',
        badgeColor: '#123456'
      })
    ).toBe('#123456')
    expect(
      resolveProjectGroupHeaderColor({
        groupBy: 'repo',
        headerKey: 'project-group:manual',
        badgeColor: '#123456'
      })
    ).toBeUndefined()
  })
})
