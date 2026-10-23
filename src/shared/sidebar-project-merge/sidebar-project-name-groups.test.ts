import { describe, expect, it } from 'vitest'
import type { Repo } from '../repo-types'
import { projectHostSetupProjectionFromRepos } from '../project-host-setup-projection'
import {
  buildProjectGroupingIndex,
  buildProjectOwnershipIndex,
  buildProjectSections,
  getDisplayedProjectGroupingForRepo,
  getProjectGroupingForRepo
} from '../project-section-grouping'
import {
  getSidebarProjectNameCollapsedGroups,
  toggleSidebarProjectNameGroup
} from './sidebar-project-name-groups'

function folder(id: string, name = 'workspace', host: Repo['executionHostId'] = 'local'): Repo {
  return {
    id,
    path: `/projects/${id}`,
    displayName: name,
    kind: 'folder',
    executionHostId: host,
    badgeColor: '#737373',
    addedAt: 1
  }
}

function catalog(repos: Repo[]) {
  const projection = projectHostSetupProjectionFromRepos(repos)
  const projectIndex = buildProjectGroupingIndex({
    projects: projection.projects,
    projectHostSetups: projection.setups
  })
  const repoMap = new Map(repos.map((repo) => [repo.id, repo]))
  const items = repos.map((repo, index) => ({
    id: `${repo.id}::${repo.path}`,
    repoId: repo.id,
    lastActivityAt: index
  }))
  const args = {
    items,
    repoIdOf: (item: (typeof items)[number]) => item.repoId,
    repoMap,
    projectIndex
  }
  const sections = buildProjectSections({
    ...args,
    placeholderRepoIds: [],
    repoOrder: new Map(repos.map((repo, index) => [repo.id, index])),
    projectOrderBy: 'manual'
  })
  return { projection, projectIndex, repoMap, items, args, sections }
}

describe('project sections grouped by display name', () => {
  it('groups three hosts while preserving native ownership and all source objects', () => {
    const repos = [
      folder('local'),
      folder('mini', 'workspace', 'runtime:mini'),
      folder('dbox', 'workspace', 'ssh:dbox')
    ]
    const before = JSON.stringify(repos)
    const result = catalog(repos)
    expect(result.sections.map(([key]) => key)).toEqual(['sidebar-name:workspace'])
    expect(result.sections[0][1].items).toEqual(result.items)
    expect(result.sections[0][1].activityItems).toEqual(result.items)
    expect(result.sections[0][1].repoIds).toEqual(new Set(['local', 'mini', 'dbox']))
    expect(result.sections[0][1].repo?.id).toBe('local')
    expect(buildProjectOwnershipIndex(result.args).size).toBe(3)
    expect(new Set(result.projection.setups.map((setup) => setup.projectId)).size).toBe(3)
    expect(getProjectGroupingForRepo('dbox', result.repoMap, result.projectIndex).key).toBe(
      'project:repo:dbox'
    )
    expect(
      getDisplayedProjectGroupingForRepo('dbox', result.repoMap, result.projectIndex)
    ).toMatchObject({ key: 'sidebar-name:workspace', projectId: 'repo:dbox' })
    expect(JSON.stringify(repos)).toBe(before)
  })

  it('joins and separates on display-name changes without changing paths or IDs', () => {
    const repos = [folder('local'), folder('mini'), folder('dbox', 'workspaces')]
    expect(catalog(repos).sections).toHaveLength(2)
    const renamed = repos.map((repo) =>
      repo.id === 'dbox' ? { ...repo, displayName: ' workspace ' } : repo
    )
    expect(catalog(renamed).sections).toHaveLength(1)
    const separated = renamed.map((repo) =>
      repo.id === 'dbox' ? { ...repo, displayName: 'workspace-dbox' } : repo
    )
    expect(catalog(separated).sections).toHaveLength(2)
    expect(separated.map(({ id, path }) => ({ id, path }))).toEqual(
      repos.map(({ id, path }) => ({ id, path }))
    )
    expect(catalog([folder('a', 'workspace'), folder('b', 'Workspace')]).sections).toHaveLength(2)
    expect(catalog([folder('a', ''), folder('b', '')]).sections).toHaveLength(2)
  })

  it('keeps the existing same-repository grouping and chooses only its effective title', () => {
    const upstream = { owner: 'Mangi-11', repo: 'Eta' }
    const repos: Repo[] = [
      { ...folder('mini', 'Movo', 'runtime:mini'), kind: 'git', upstream },
      { ...folder('dbox', 'another title', 'runtime:dbox'), kind: 'git', upstream },
      folder('other', 'another title')
    ]
    const result = catalog(repos)
    expect(result.sections).toHaveLength(2)
    expect(result.sections[0][0]).toBe('project:github:mangi-11/eta')
    expect(result.sections[0][1].items.map((item) => item.repoId)).toEqual(['mini', 'dbox'])
    expect(result.projectIndex?.nameGroups.size).toBe(0)
  })

  it('merges names across providers without changing either repository identity', () => {
    const repos: Repo[] = [
      { ...folder('github', 'tools'), kind: 'git', upstream: { owner: 'one', repo: 'tools' } },
      {
        ...folder('gitlab', 'tools', 'ssh:gitlab'),
        kind: 'git',
        gitRemoteIdentity: {
          remoteName: 'origin',
          canonicalKey: 'gitlab.example/team/tools',
          remoteUrl: 'https://gitlab.example/team/tools.git'
        }
      }
    ]
    const result = catalog(repos)
    expect(result.sections).toHaveLength(1)
    expect(result.projection.projects.map((project) => project.id)).toEqual([
      'github:one/tools',
      'git:gitlab.example/team/tools'
    ])
  })

  it('does not bypass the existing same-surface independent-checkout split', () => {
    const repos: Repo[] = ['a', 'b'].map((id) => ({
      ...folder(id),
      kind: 'git',
      upstream: { owner: 'one', repo: 'workspace' }
    }))
    repos.push(folder('ordinary', 'workspace', 'runtime:other'))
    const result = catalog(repos)
    expect(result.sections).toHaveLength(3)
    expect(result.sections.every(([key]) => !key.startsWith('sidebar-name:'))).toBe(true)
  })

  it('inherits collapsed sources and clears their aliases when the merged header expands', () => {
    const result = catalog([folder('a'), folder('b')])
    const groups = result.projectIndex!.nameGroups
    const saved = new Set(['project:repo:a', 'project:repo:b'])
    expect(getSidebarProjectNameCollapsedGroups(saved, groups).has('sidebar-name:workspace')).toBe(
      true
    )
    const toggle = (key: string) => {
      if (!saved.delete(key)) {
        saved.add(key)
      }
    }
    toggleSidebarProjectNameGroup('sidebar-name:workspace', saved, groups, toggle)
    expect(getSidebarProjectNameCollapsedGroups(saved, groups).has('sidebar-name:workspace')).toBe(
      false
    )
    toggleSidebarProjectNameGroup('sidebar-name:workspace', saved, groups, toggle)
    expect(saved.has('sidebar-name:workspace')).toBe(true)
    toggleSidebarProjectNameGroup('sidebar-name:workspace', saved, groups, toggle)
    expect(saved.size).toBe(0)
  })
})
