/**
 * Same-name projects share a header; protected checkouts and untracked repos
 * keep path disambiguation when their native sections stay separate.
 */
import { describe, expect, it } from 'vitest'
import { buildRows } from './worktree-list/grouping/build-rows.test-fixture'
import { project, projectHostSetups, repo, worktree } from './worktree-list-groups-test-fixtures'
import type { Project, ProjectHostSetup } from '../../../../shared/project-types'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'

const makeProject = (id: string, repoId: string): Project => ({
  ...project,
  id,
  displayName: 'api',
  sourceRepoIds: [repoId]
})

const makeSetup = (checkout: Repo, projectId: string): ProjectHostSetup => ({
  ...projectHostSetups[0]!,
  id: checkout.id,
  projectId,
  repoId: checkout.id,
  path: checkout.path,
  displayName: checkout.displayName
})

function buildHeaders(repos: Repo[], projects: Project[], setups: ProjectHostSetup[]) {
  const worktrees = repos.map((entry): Worktree => ({
    ...worktree,
    id: `wt-${entry.id}`,
    repoId: entry.id
  }))
  const rows = buildRows(
    'repo',
    worktrees,
    new Map(repos.map((entry) => [entry.id, entry])),
    null,
    new Set(),
    undefined,
    undefined,
    undefined,
    {},
    new Map(worktrees.map((entry) => [entry.id, entry])),
    false,
    undefined,
    [],
    new Set(),
    new Map(),
    new Map(),
    [],
    { projects, projectHostSetups: setups }
  )
  return rows.filter((row) => row.type === 'header')
}

describe('sidebar section headers with colliding display names', () => {
  const workRepo: Repo = { ...repo, id: 'repo-work', path: '/work/api', displayName: 'api' }
  const ossRepo: Repo = { ...repo, id: 'repo-oss', path: '/oss/api', displayName: 'api' }

  it('merges two native project sections that share a display name', () => {
    expect(
      buildHeaders(
        [workRepo, ossRepo],
        [makeProject('github:acme/api', workRepo.id), makeProject('gitlab:me/api', ossRepo.id)],
        [makeSetup(workRepo, 'github:acme/api'), makeSetup(ossRepo, 'gitlab:me/api')]
      )
    ).toMatchObject([{ key: 'sidebar-name:api', label: 'api', count: 2 }])
  })

  it('keeps path labels for checkouts protected by the native grouping rule', () => {
    expect(
      buildHeaders(
        [workRepo, ossRepo],
        [
          {
            ...makeProject('github:acme/api', workRepo.id),
            sourceRepoIds: [workRepo.id, ossRepo.id]
          }
        ],
        [makeSetup(workRepo, 'github:acme/api'), makeSetup(ossRepo, 'github:acme/api')]
      )
    ).toMatchObject([
      { key: 'project:github:acme/api::setup:repo-work', label: 'work/api' },
      { key: 'project:github:acme/api::setup:repo-oss', label: 'oss/api' }
    ])
  })

  it('leaves a lone project header un-suffixed', () => {
    expect(
      buildHeaders(
        [workRepo],
        [makeProject('github:acme/api', workRepo.id)],
        [makeSetup(workRepo, 'github:acme/api')]
      )
    ).toMatchObject([{ key: 'project:github:acme/api', label: 'api' }])
  })

  it('path-disambiguates untracked repo headers that share a display name', () => {
    expect(buildHeaders([workRepo, ossRepo], [], [])).toMatchObject([
      { key: 'repo:repo-work', label: 'work/api' },
      { key: 'repo:repo-oss', label: 'oss/api' }
    ])
  })
})
