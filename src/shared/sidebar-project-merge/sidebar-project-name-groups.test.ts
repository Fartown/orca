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
  const repoMap = new Map(repos.map((repo) => [repo.id, repo]))
  const projectIndex = buildProjectGroupingIndex(
    {
      projects: projection.projects,
      projectHostSetups: projection.setups
    },
    repoMap
  )
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

  it('uses the same canonical setup as native grouping when a repo ID exists on two hosts', () => {
    const upstream = { owner: 'one', repo: 'workspace' }
    const result = catalog([
      {
        ...folder('reused', 'workspace', 'ssh:remote'),
        path: '/remote/workspace',
        kind: 'git',
        upstream
      },
      { ...folder('reused'), path: '/local/workspace', kind: 'git', upstream },
      { ...folder('second'), path: '/local/workspace-copy', kind: 'git', upstream },
      folder('ordinary', 'workspace', 'runtime:other')
    ])
    expect(result.sections).toHaveLength(3)
    expect(result.sections.every(([key]) => !key.startsWith('sidebar-name:'))).toBe(true)
  })

  it('merges only within the original manual group and keeps singleton section keys', () => {
    const repos = [
      { ...folder('a'), projectGroupId: 'one' },
      { ...folder('b'), projectGroupId: 'one' },
      { ...folder('c'), projectGroupId: 'two' },
      folder('d')
    ]
    const result = catalog(repos)
    expect(result.sections.map(([key]) => key)).toEqual([
      'sidebar-name:workspace::group:one',
      'project:repo:c',
      'project:repo:d'
    ])
    expect(result.sections[0][1].repoIds).toEqual(new Set(['a', 'b']))
    for (const repo of repos) {
      const display = getDisplayedProjectGroupingForRepo(
        repo.id,
        result.repoMap,
        result.projectIndex
      )
      expect(result.sections.find(([key]) => key === display.key)?.[1].repoIds.has(repo.id)).toBe(
        true
      )
    }
  })

  it('retains the native project when its original directories span manual groups', () => {
    const upstream = { owner: 'one', repo: 'workspace' }
    const result = catalog([
      { ...folder('a'), kind: 'git', upstream, projectGroupId: 'one' },
      { ...folder('b', 'workspace', 'ssh:other'), kind: 'git', upstream, projectGroupId: 'two' },
      { ...folder('c'), projectGroupId: 'one' }
    ])
    expect(result.sections.map(([key]) => key)).toEqual([
      'project:github:one/workspace',
      'project:repo:c'
    ])
    expect(result.sections[0][1].repoIds).toEqual(new Set(['a', 'b']))
  })

  it('keeps the original global section ordering and action anchor', () => {
    const result = catalog([folder('a'), folder('between', 'other'), folder('c')])
    const sections = buildProjectSections({
      ...result.args,
      placeholderRepoIds: [],
      repoOrder: new Map([
        ['c', 0],
        ['between', 1],
        ['a', 2]
      ]),
      projectOrderBy: 'manual'
    })
    expect(sections.map(([key]) => key)).toEqual(['sidebar-name:workspace', 'project:repo:between'])
    expect(sections[0][1].repo?.id).toBe('c')
    expect(sections[0][1].items.map((item) => item.repoId)).toEqual(['c', 'a'])
    expect(sections[0][1].repoIds).toEqual(new Set(['c', 'a']))
  })

  it('retains the original fallback sections when the project model is unavailable', () => {
    const result = catalog([folder('a'), folder('b')])
    const sections = buildProjectSections({
      ...result.args,
      projectIndex: null,
      placeholderRepoIds: [],
      repoOrder: new Map(),
      projectOrderBy: 'manual'
    })
    expect(sections.map(([key]) => key)).toEqual(['repo:a', 'repo:b'])
  })

  it.each([true, false])(
    'preserves notice fallback containers with a missing catalog (empty: %s)',
    (empty) => {
      const repos = [
        { ...folder('a'), projectGroupId: 'one' },
        { ...folder('b'), projectGroupId: 'two' }
      ]
      const result = catalog(repos)
      const repoMap = new Map((empty ? [] : repos.slice(0, 1)).map((repo) => [repo.id, repo]))
      const sections = buildProjectSections({
        ...result.args,
        items: [],
        repoMap,
        projectIndex: buildProjectGroupingIndex(
          {
            projects: result.projection.projects,
            projectHostSetups: result.projection.setups
          },
          repoMap
        ),
        placeholderRepoIds: [],
        noticeRepos: repos.map((repo) => [repo.id, repo] as const),
        repoOrder: new Map(),
        projectOrderBy: 'manual'
      })
      expect(sections.map(([key]) => key)).toEqual(['project:repo:a', 'project:repo:b'])
      expect(sections.map(([, section]) => section.repo?.projectGroupId)).toEqual(['one', 'two'])
    }
  )

  it('does not name-merge an incomplete native project through a known sibling', () => {
    const upstream = { owner: 'one', repo: 'workspace' }
    const repos = [
      { ...folder('a'), kind: 'git' as const, upstream, projectGroupId: 'one' },
      {
        ...folder('b', 'workspace', 'ssh:other'),
        kind: 'git' as const,
        upstream,
        projectGroupId: 'two'
      },
      { ...folder('c'), projectGroupId: 'one' }
    ]
    const result = catalog(repos)
    const repoMap = new Map([repos[0], repos[2]].map((repo) => [repo.id, repo]))
    const sections = buildProjectSections({
      ...result.args,
      items: [],
      repoMap,
      projectIndex: buildProjectGroupingIndex(
        { projects: result.projection.projects, projectHostSetups: result.projection.setups },
        repoMap
      ),
      placeholderRepoIds: ['c'],
      noticeRepos: [['b', repos[1]]],
      repoOrder: new Map(),
      projectOrderBy: 'manual'
    })
    expect(sections).toHaveLength(2)
    expect(sections.every(([key]) => !key.startsWith('sidebar-name:'))).toBe(true)
    expect(sections.find(([key]) => key === 'project:github:one/workspace')?.[1].repo?.id).toBe('b')
  })

  it('keeps the existing host containers while grouping names within each host', () => {
    const repos = [folder('a'), folder('b'), folder('remote', 'workspace', 'ssh:mini')]
    const result = catalog(repos)
    const sections = buildProjectSections({
      ...result.args,
      projectIndex: buildProjectGroupingIndex(
        {
          projects: result.projection.projects,
          projectHostSetups: result.projection.setups,
          groupNamesByHost: true
        },
        result.repoMap
      ),
      placeholderRepoIds: [],
      repoOrder: new Map(),
      projectOrderBy: 'manual'
    })
    expect(sections.map(([key]) => key)).toEqual([
      'sidebar-name:workspace::host:local',
      'project:repo:remote'
    ])
    expect(sections.map(([, section]) => section.repoIds)).toEqual([
      new Set(['a', 'b']),
      new Set(['remote'])
    ])
  })

  it('chooses the original recent section as the action anchor without modifying activity', () => {
    const result = catalog([folder('a'), folder('between', 'other'), folder('c')])
    const sections = buildProjectSections({
      ...result.args,
      placeholderRepoIds: [],
      repoOrder: new Map([
        ['a', 0],
        ['between', 1],
        ['c', 2]
      ]),
      projectOrderBy: 'recent'
    })
    expect(sections.map(([key]) => key)).toEqual(['sidebar-name:workspace', 'project:repo:between'])
    expect(sections[0][1].repo?.id).toBe('c')
    expect(sections[0][1].items).toEqual([result.items[2], result.items[0]])
    expect(sections[0][1].activityItems).toEqual([result.items[2], result.items[0]])
  })
})
