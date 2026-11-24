import { describe, expect, it } from 'vitest'
import { createTestStore } from '@/store/testing/app-store-test-fixture'
import { makeWorktree } from '@/store/slices/worktrees/worktree.test-fixture'
import type { LocalTaskProposalItem } from '../../../shared/local-tasks/local-task-dispatcher-rpc-params'
import type { LocalTaskProject } from '../../../shared/local-tasks/local-task-types'
import { getDefaultSettings } from '../../../shared/orca-profiles/constants'
import type { ProjectHostSetup } from '../../../shared/project/project-types'
import type { Repo } from '../../../shared/repository/repo-types'
import {
  proposalItemProjectCandidates,
  proposalLaunchAgent,
  proposalProjectCandidates,
  proposalRepoScope,
  proposalWorkspaceOwner,
  resolveProposalProject
} from './local-task-proposal-targets'

function project(id: string, prefix: string, repos: string[]): LocalTaskProject {
  return {
    id,
    name: id,
    prefix,
    aliases: [],
    repos,
    defaultRepoId: repos[0] ?? null,
    lastExecutionHostId: null,
    rules: { startMovesToInProgress: true, prMergedCompletes: true },
    statuses: [],
    createdAt: 0,
    updatedAt: 0,
    revision: 1
  }
}

const shop = project('Shop', 'SHOP', ['orca-shop'])
const ops = project('Shop ops', 'OPS', ['orca-shop'])
const web = project('Storefront', 'WEB', ['orca-shop', 'orca-docs'])
const docs = project('Docs', 'DOC', ['orca-docs'])
const paired = project('runtime:env-1/api', 'API', ['orca-shop'])
const ids = (projects: LocalTaskProject[]): string[] => projects.map((entry) => entry.id)

describe('proposalProjectCandidates', () => {
  it("offers every project in the target's library that tracks the repository", () => {
    const all = [shop, ops, web, docs, paired]
    expect(ids(proposalProjectCandidates(all, new Set(['orca-shop'])))).toEqual([
      'Shop',
      'Shop ops',
      'Storefront'
    ])
  })

  it('names the candidates when it cannot pick one, so the dispatcher can resubmit', () => {
    expect(resolveProposalProject([shop, ops, docs], undefined, new Set(['orca-shop']))).toEqual({
      miss: 'name the task project: more than one could take this task (SHOP, OPS)'
    })
  })

  it('offers the only project there is, even one not tracking the repository', () => {
    expect(ids(proposalProjectCandidates([docs, paired], new Set(['orca-shop'])))).toEqual(['Docs'])
  })

  it('offers none when several projects exist but none tracks the repository', () => {
    expect(proposalProjectCandidates([shop, docs], new Set(['orca-blog']))).toEqual([])
  })
})

const sshRepo: Repo = {
  id: 'shop',
  path: '/srv/shop',
  displayName: 'shop',
  badgeColor: 'gray',
  addedAt: 1,
  kind: 'git',
  executionHostId: 'ssh:box',
  connectionId: 'box'
}

const sshSetup: ProjectHostSetup = {
  id: 'setup-shop',
  projectId: 'orca-shop',
  hostId: 'ssh:box',
  repoId: 'shop',
  path: '/srv/shop',
  displayName: 'shop',
  kind: 'git',
  connectionId: 'box',
  executionHostId: 'ssh:box',
  setupState: 'ready',
  setupMethod: 'legacy-repo',
  createdAt: 1,
  updatedAt: 1
}

describe('proposalItemProjectCandidates', () => {
  const projects = [shop, ops, web, docs]
  const store = createTestStore()
  store.setState({ repos: [sshRepo], projectHostSetups: [sshSetup] })

  it('qualifies a source repository id by host instead of choosing its identically named local row', () => {
    const twins = createTestStore()
    twins.setState({
      repos: [
        { ...sshRepo, executionHostId: 'local', connectionId: null },
        { ...sshRepo, executionHostId: 'runtime:env-1', connectionId: null }
      ]
    })
    expect(proposalRepoScope(twins.getState(), 'shop', 'runtime:env-1')?.library).toBe(
      'runtime:env-1'
    )
    expect(proposalRepoScope(twins.getState(), 'shop')).toBeNull()
  })

  it('reads a start in a new workspace of a repository on an SSH host from the rows here', () => {
    const start: LocalTaskProposalItem = {
      kind: 'start',
      title: 'Export',
      prompt: 'Add CSV export',
      target: { repoId: 'shop', hostId: 'ssh:box' }
    }
    expect(ids(proposalItemProjectCandidates(store.getState(), projects, start))).toEqual([
      'Shop',
      'Shop ops',
      'Storefront'
    ])
    const unknown = { ...start, target: { repoId: 'gone' } }
    expect(proposalItemProjectCandidates(store.getState(), projects, unknown)).toEqual([])
  })

  it('reads a record by the Orca project of its workspace', () => {
    const worktree = makeWorktree({
      id: 'docs::/srv/docs/fix',
      repoId: 'docs',
      hostId: 'ssh:box',
      projectId: 'orca-docs'
    })
    const state = { ...store.getState(), getKnownWorktreeById: () => worktree }
    const record: LocalTaskProposalItem = {
      kind: 'record',
      title: 'Hotfix',
      target: { worktreeId: worktree.id, hostId: 'ssh:box' }
    }
    expect(ids(proposalItemProjectCandidates(state, projects, record))).toEqual([
      'Storefront',
      'Docs'
    ])
    const link: LocalTaskProposalItem = { kind: 'link', taskId: 't-1', target: record.target }
    expect(proposalItemProjectCandidates(state, projects, link)).toEqual([])
  })
})

describe('proposalWorkspaceOwner', () => {
  it('names the task a workspace already belongs to, on the same host only', () => {
    const worktree = makeWorktree({ id: 'shop::/srv/shop/fix', repoId: 'shop', hostId: 'ssh:box' })
    const owner = {
      id: 't-3',
      projectId: 'Shop',
      number: 3,
      ref: 'SHOP-3',
      title: 'Hotfix',
      description: '',
      statusId: 's',
      criteria: [],
      priority: 0 as const,
      labels: [],
      parentId: null,
      createdAt: 0,
      updatedAt: 0,
      revision: 1
    }
    const link = {
      taskId: 't-3',
      hostId: 'ssh:box',
      kind: 'git-worktree' as const,
      instanceId: null,
      worktreeId: worktree.id,
      folderWorkspaceId: null,
      repoId: 'shop',
      branchSnapshot: null,
      nameSnapshot: null,
      hostLabelSnapshot: null,
      linkedVia: 'start' as const,
      linkedAt: 0
    }
    const state = createTestStore().getState()
    const domain = { tasks: [owner], links: { workspaces: [link], sessions: [] } }
    expect(proposalWorkspaceOwner(state, domain, worktree)?.ref).toBe('SHOP-3')
    expect(proposalWorkspaceOwner(state, domain, { ...worktree, hostId: 'ssh:other' })).toBeNull()
  })
})

describe('proposalLaunchAgent', () => {
  it('says when the default stands in for an agent that is turned off', () => {
    const store = createTestStore()
    store.setState({
      settings: {
        ...getDefaultSettings('/home/test'),
        defaultTuiAgent: 'claude',
        disabledTuiAgents: ['codex']
      }
    })
    expect(proposalLaunchAgent(store.getState(), 'codex')).toEqual({
      agent: 'claude',
      substituted: true
    })
    expect(proposalLaunchAgent(store.getState(), 'claude')).toEqual({
      agent: 'claude',
      substituted: false
    })
    expect(proposalLaunchAgent(store.getState(), undefined)).toEqual({
      agent: 'claude',
      substituted: false
    })
  })
})
