import { describe, expect, it } from 'vitest'
import { createTestStore } from '@/store/slices/store-test-helpers'
import { makeWorktree } from '@/store/slices/worktrees-slice-test-fixtures'
import type { LocalTaskProposalItem } from '../../../shared/local-tasks/local-task-dispatcher-rpc-params'
import type { LocalTaskProject } from '../../../shared/local-tasks/local-task-types'
import type { ProjectHostSetup } from '../../../shared/project-types'
import type { Repo } from '../../../shared/repo-types'
import {
  proposalItemProjectCandidates,
  proposalProjectCandidates,
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
