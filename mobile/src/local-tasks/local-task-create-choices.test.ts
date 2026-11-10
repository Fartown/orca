import { describe, expect, it } from 'vitest'
import type { LocalTaskLinks } from '../../../src/shared/local-tasks/local-task-link-types'
import type { LocalTask, LocalTaskProject } from '../../../src/shared/local-tasks/local-task-types'
import { ProjectSectionCatalogSchema } from '../../../src/shared/project-section-catalog-schema'
import {
  localTaskCreateDefaultRepo,
  localTaskCreateRepoChoices,
  localTaskCreateWorkspaceChoices,
  localTaskCreateWorkspaceGroups,
  readLocalTaskMainWorkspaceIds,
  type LocalTaskCreateHosts
} from './local-task-create-choices'
import { localTaskEndpointFor } from './local-task-endpoint'
import { localTaskSetupsFor } from './local-task-project-setups'
import { readLocalTaskWorkspaceCandidates } from './local-task-workspace-candidates'
import { readLocalTaskWorkspaceListing } from './local-task-workspace-row'

function project(id: string, prefix: string, repos: string[]): LocalTaskProject {
  return {
    id,
    name: id,
    prefix,
    aliases: [],
    repos,
    defaultRepoId: repos[0] ?? null,
    lastExecutionHostId: null,
    rules: { startMovesToInProgress: true, prMergedCompletes: false },
    statuses: [],
    createdAt: 0,
    updatedAt: 0,
    revision: 1
  }
}

const shop = project('shop', 'SHOP', ['github:acme/shop'])
const orc = project('orc', 'ORC', ['github:acme/orca'])
const owner: LocalTask = {
  id: 'task-12',
  projectId: 'shop',
  number: 12,
  ref: 'SHOP-12',
  title: 'Export orders',
  description: '',
  criteria: [],
  statusId: 'todo',
  priority: 0,
  labels: [],
  parentId: null,
  createdAt: 0,
  updatedAt: 0,
  revision: 1
}

// The paired Orca's catalog: orca on its own machine, shop over SSH on minizc, infra on dbox.
const catalog = ProjectSectionCatalogSchema.parse({
  repos: [
    { id: 'repo-shop', displayName: 'shop', path: '/shop' },
    { id: 'repo-orca', displayName: 'orca', path: '/orca' },
    { id: 'repo-infra', displayName: 'infra', path: '/infra' }
  ],
  projects: [
    { id: 'github:acme/shop', displayName: 'shop' },
    { id: 'github:acme/orca', displayName: 'orca' },
    { id: 'github:acme/infra', displayName: 'infra' }
  ],
  setups: [
    setup('orca-local', 'github:acme/orca', 'local', 'repo-orca'),
    setup('shop-minizc', 'github:acme/shop', 'ssh:minizc', 'repo-shop'),
    setup('infra-dbox', 'github:acme/infra', 'ssh:dbox', 'repo-infra')
  ],
  projectOrderBy: 'manual'
})

function setup(id: string, projectId: string, hostId: string, repoId: string) {
  const displayName = id.split('-')[0]
  return { id, projectId, hostId, repoId, path: `/${id}`, displayName, setupMethod: 'cloned' }
}

function row(repoId: string, hostId: string, name: string, extra: Record<string, unknown> = {}) {
  return { worktreeId: `${repoId}::/${name}`, repoId, hostId, displayName: name, ...extra }
}

const rows = [
  row('repo-orca', 'local', 'main', { isMainWorktree: true }),
  row('repo-orca', 'local', 'feat-reconnect'),
  row('repo-infra', 'ssh:dbox', 'deploy-scripts'),
  row('repo-shop', 'ssh:minizc', 'shop-12-order-export'),
  row('repo-shop', 'ssh:minizc', 'refund-webhook', {
    linkedPR: { number: 233, state: 'open', checksStatus: 'failure' }
  }),
  row('repo-shop', 'ssh:minizc', 'main', { isMainWorktree: true })
]

const links: LocalTaskLinks = {
  workspaces: [
    {
      taskId: owner.id,
      hostId: 'ssh:minizc',
      kind: 'git-worktree',
      instanceId: null,
      worktreeId: 'repo-shop::/shop-12-order-export',
      folderWorkspaceId: null,
      repoId: 'repo-shop',
      branchSnapshot: null,
      nameSnapshot: null,
      hostLabelSnapshot: null,
      linkedVia: 'start',
      linkedAt: 1
    }
  ],
  sessions: []
}

const hosts: LocalTaskCreateHosts = {
  name: (hostId) =>
    ({ local: 'MacBook Pro', 'ssh:minizc': 'minizc', 'ssh:dbox': 'dbox' })[hostId] ?? '',
  connected: (hostId) => (hostId === 'ssh:dbox' ? false : hostId === 'local' ? null : true)
}

function choicesIn(currentProjectId: string) {
  return localTaskCreateWorkspaceChoices({
    candidates: readLocalTaskWorkspaceCandidates(rows),
    listing: readLocalTaskWorkspaceListing({ worktrees: rows, truncated: false }),
    mainIds: readLocalTaskMainWorkspaceIds(rows),
    catalog,
    tasks: [owner],
    links,
    projects: [shop, orc],
    currentProjectId,
    hosts
  })
}

describe('New task’s 已有工作区 on the phone (m8)', () => {
  it('groups by repo·host: the opened project’s first, main on top, hosts out of contact last', () => {
    const groups = localTaskCreateWorkspaceGroups({
      choices: choicesIn('shop'),
      query: '',
      firstOrcaProjectIds: shop.repos,
      hosts
    })
    expect(
      groups.map((group) => [
        group.repoLabel,
        hosts.name(group.ownerHostId),
        group.offline,
        group.choices.map((choice) => choice.candidate.displayName)
      ])
    ).toEqual([
      ['shop', 'minizc', false, ['main', 'shop-12-order-export', 'refund-webhook']],
      ['orca', 'MacBook Pro', false, ['main', 'feat-reconnect']],
      ['infra', 'dbox', true, ['deploy-scripts']]
    ])
  })

  it('says what each workspace is and where a task working there goes', () => {
    const byName = new Map(
      choicesIn('shop').map((choice) => [
        `${choice.repoLabel}/${choice.candidate.displayName}`,
        choice
      ])
    )
    const held = byName.get('shop/shop-12-order-export')
    expect([held?.owner?.ref, held?.holder?.taskId, held?.projectId]).toEqual([
      'SHOP-12',
      owner.id,
      'shop'
    ])
    expect(byName.get('shop/refund-webhook')?.review).toEqual({
      kind: 'pr',
      number: 233,
      state: 'open',
      checks: 'failure'
    })
    expect(byName.get('shop/main')?.main).toBe(true)
    // The task follows the repository into the project that tracks it.
    expect(byName.get('orca/feat-reconnect')?.projectId).toBe('orc')
    // An SSH host the paired host says is not connected stays listed, and can't be picked.
    expect(byName.get('infra/deploy-scripts')?.block).toBe('host-offline')
  })

  it('searches every word across workspace, repository, host and the holder’s ref', () => {
    const search = (query: string) =>
      localTaskCreateWorkspaceGroups({
        choices: choicesIn('shop'),
        query,
        firstOrcaProjectIds: shop.repos,
        hosts
      }).flatMap((group) => group.choices.map((choice) => choice.candidate.displayName))
    expect(search('minizc refund')).toEqual(['refund-webhook'])
    expect(search('SHOP-12')).toEqual(['shop-12-order-export'])
  })
})

describe('New task’s 新建工作区 on the phone (m8)', () => {
  const setups = localTaskSetupsFor(catalog, localTaskEndpointFor(undefined), [])
  const repos = (currentProjectId: string, first: readonly string[]) =>
    localTaskCreateRepoChoices({
      setups,
      projects: [shop, orc],
      currentProjectId,
      firstOrcaProjectIds: first,
      hosts
    })

  it('offers the opened project’s repositories first and greys out a host out of contact', () => {
    expect(
      repos('shop', shop.repos).map((choice) => [
        choice.setup.label,
        choice.setup.ownerHostId,
        choice.projectId,
        choice.block
      ])
    ).toEqual([
      ['shop', 'ssh:minizc', 'shop', null],
      ['orca', 'local', 'orc', null],
      ['infra', 'ssh:dbox', 'shop', 'host-offline']
    ])
  })

  it('starts on the project’s own usable repository, never one that would move the task', () => {
    expect(localTaskCreateDefaultRepo(repos('shop', shop.repos), shop)?.setup.label).toBe('shop')
    const infraOnly = project('ops', 'OPS', ['github:acme/infra'])
    expect(localTaskCreateDefaultRepo(repos('ops', infraOnly.repos), infraOnly)).toBeNull()
  })
})
