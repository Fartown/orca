import { describe, expect, it } from 'vitest'
import type { Repo } from '../repo-types'
import { projectHostSetupProjectionFromRepos } from '../project-host-setup-projection'
import { buildProjectGroupingIndex, getProjectGroupingForRepo } from '../project-section-grouping'
import {
  applySidebarProjectMerges,
  normalizeSidebarProjectMerges,
  replaceSidebarProjectMerge
} from './sidebar-project-merges'

function repo(id: string, host: Repo['executionHostId'], kind: Repo['kind'] = 'folder'): Repo {
  return {
    id,
    path: `/projects/${id}`,
    displayName: id,
    badgeColor: '#737373',
    addedAt: 1,
    kind,
    executionHostId: host
  }
}

describe('explicit sidebar project merges', () => {
  it('moves only the selected folder from orca into the three-host workspace display project', () => {
    const local = repo('local-workspace', 'local')
    const mini = repo('mini-workspace', 'runtime:mini')
    const dbox = {
      ...repo('dbox-workspaces', 'runtime:dbox'),
      upstream: { owner: 'stablyai', repo: 'orca' }
    }
    const orca = { ...repo('orca', 'local', 'git'), upstream: { owner: 'stablyai', repo: 'orca' } }
    const repos = [local, mini, dbox, orca]
    const original = projectHostSetupProjectionFromRepos(repos)
    const before = JSON.stringify({ repos, original })
    const display = applySidebarProjectMerges(original, [
      {
        id: 'workspace',
        name: 'workspace',
        members: [
          { hostId: 'local', repoId: local.id },
          { hostId: 'runtime:mini', repoId: mini.id },
          { hostId: 'runtime:dbox', repoId: dbox.id }
        ]
      }
    ])
    const index = buildProjectGroupingIndex({
      projects: display.projects,
      projectHostSetups: display.setups
    })
    const map = new Map(repos.map((entry) => [entry.id, entry]))
    for (const member of [local, mini, dbox]) {
      expect(getProjectGroupingForRepo(member.id, map, index)).toMatchObject({
        key: 'project:sidebar-merged:workspace',
        label: 'workspace'
      })
    }
    expect(getProjectGroupingForRepo(orca.id, map, index).key).toBe('project:github:stablyai/orca')
    expect(
      display.setups.map(({ id, repoId, hostId, path }) => ({ id, repoId, hostId, path }))
    ).toEqual(original.setups.map(({ id, repoId, hostId, path }) => ({ id, repoId, hostId, path })))
    expect(JSON.stringify({ repos, original })).toBe(before)
  })

  it('groups both Movo checkouts despite different upstreams and leaves their Git identities intact', () => {
    const mini: Repo = {
      ...repo('mini-movo', 'runtime:mini', 'git'),
      displayName: 'Movo',
      upstream: { owner: 'Mangi-11', repo: 'Eta' }
    }
    const dbox: Repo = {
      ...repo('dbox-movo', 'runtime:dbox', 'git'),
      displayName: 'Movo',
      upstream: null
    }
    for (const entry of [mini, dbox]) {
      entry.gitRemoteIdentity = {
        canonicalKey: 'github.com/Fartown/Movo',
        remoteName: 'origin',
        remoteUrl: 'https://github.com/Fartown/Movo.git'
      }
    }
    const original = projectHostSetupProjectionFromRepos([mini, dbox])
    expect(new Set(original.setups.map((setup) => setup.projectId)).size).toBe(2)
    const display = applySidebarProjectMerges(original, [
      {
        id: 'movo',
        name: 'Movo',
        members: [
          { hostId: 'runtime:mini', repoId: mini.id },
          { hostId: 'runtime:dbox', repoId: dbox.id }
        ]
      }
    ])
    expect(new Set(display.setups.map((setup) => setup.projectId))).toEqual(
      new Set(['sidebar-merged:movo'])
    )
    expect(display.projects).toMatchObject([
      { displayName: 'Movo', sourceRepoIds: ['mini-movo', 'dbox-movo'] }
    ])
    expect(mini.upstream).toEqual({ owner: 'Mangi-11', repo: 'Eta' })
    expect(dbox.upstream).toBeNull()
    expect(applySidebarProjectMerges(original, [])).toBe(original)
  })

  it('qualifies a member by its execution host, including SSH twins with the same repo id', () => {
    const repos = [
      repo('same', 'local'),
      { ...repo('same', 'local'), connectionId: 'mini' },
      repo('other', 'runtime:dbox')
    ]
    const original = projectHostSetupProjectionFromRepos(repos)
    const display = applySidebarProjectMerges(original, [
      {
        id: 'selected',
        name: 'selected',
        members: [
          { hostId: 'ssh:mini', repoId: 'same' },
          { hostId: 'runtime:dbox', repoId: 'other' }
        ]
      }
    ])
    expect(display.setups[0].projectId).toBe('repo:same')
    expect(display.setups[1].projectId).toBe('sidebar-merged:selected')
    expect(display.setups[2].projectId).toBe('sidebar-merged:selected')
  })

  it('honors an explicit merge of distinct checkouts on one execution host', () => {
    const repos = [repo('a', 'local', 'git'), repo('b', 'local', 'git')]
    const original = projectHostSetupProjectionFromRepos(repos)
    const display = applySidebarProjectMerges(original, [
      {
        id: 'same-host',
        name: 'one project',
        members: [
          { hostId: 'local', repoId: 'a' },
          { hostId: 'local', repoId: 'b' }
        ]
      }
    ])
    const index = buildProjectGroupingIndex({
      projects: display.projects,
      projectHostSetups: display.setups
    })
    const map = new Map(repos.map((entry) => [entry.id, entry]))
    expect(getProjectGroupingForRepo('a', map, index).key).toBe(
      getProjectGroupingForRepo('b', map, index).key
    )
  })

  it('retains offline members in preferences and applies them when their catalog returns', () => {
    const members = [
      { hostId: 'local', repoId: 'a' },
      { hostId: 'runtime:mini', repoId: 'b' }
    ]
    const preferences = [{ id: 'saved', name: 'workspace', members }]
    const local = projectHostSetupProjectionFromRepos([repo('a', 'local')])
    const display = applySidebarProjectMerges(local, preferences)
    expect(display.projects[0].displayName).toBe('workspace')
    expect(preferences[0].members).toHaveLength(2)
    const all = projectHostSetupProjectionFromRepos([repo('a', 'local'), repo('b', 'runtime:mini')])
    expect(
      new Set(applySidebarProjectMerges(all, preferences).setups.map((setup) => setup.projectId))
        .size
    ).toBe(1)
  })

  it('rejects malformed and singleton merges, and moves selected members out of previous merges', () => {
    expect(
      normalizeSidebarProjectMerges([
        null,
        { id: 'bad', name: 'bad', members: [{ hostId: 'local', repoId: 'a' }] }
      ])
    ).toEqual([])
    const current = normalizeSidebarProjectMerges([
      {
        id: 'old',
        name: 'old',
        members: [
          { hostId: 'local', repoId: 'a' },
          { hostId: 'runtime:mini', repoId: 'b' }
        ]
      }
    ])
    const next = replaceSidebarProjectMerge(current, {
      id: 'new',
      name: 'new',
      members: [
        { hostId: 'runtime:mini', repoId: 'b' },
        { hostId: 'runtime:dbox', repoId: 'c' }
      ]
    })
    expect(next.map((merge) => merge.id)).toEqual(['new'])
    expect(current[0].members).toHaveLength(2)
  })
})
