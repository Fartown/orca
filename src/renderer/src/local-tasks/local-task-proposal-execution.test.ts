import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalTaskProposal } from '../../../shared/local-tasks/local-task-dispatcher-types'
import type { LocalTaskProject } from '../../../shared/local-tasks/local-task-types'

const fixture = vi.hoisted(() => ({ recordResults: vi.fn() }))

vi.mock('@/store', async () => {
  const { createTestStore } = await import('@/store/slices/store-test-helpers')
  return { useAppStore: createTestStore() }
})
vi.mock('./local-task-dispatcher-client', () => ({
  localTaskDispatcherClient: { recordResults: fixture.recordResults }
}))

import {
  executeLocalTaskProposal,
  type LocalTaskProposalExecutors
} from './local-task-proposal-execution'
import { resolveProposalProject } from './local-task-proposal-targets'

function proposal(overrides: Partial<LocalTaskProposal> = {}): LocalTaskProposal {
  return {
    id: 'proposal-1',
    conversationId: 'conversation-1',
    summary: 'Ship the export',
    items: [
      {
        kind: 'start',
        title: 'Export',
        prompt: 'Add CSV export',
        target: { worktreeId: 'repo1::/w' }
      },
      { kind: 'append', taskId: 'task-2', sessionLinkId: 'link-2', text: 'Run the tests' },
      { kind: 'stop', taskId: 'task-3', sessionLinkId: 'link-3', reason: 'Superseded' }
    ],
    status: 'confirmed',
    keptItemIndexes: null,
    results: null,
    createdAt: 0,
    decidedAt: 1,
    decidedSource: 'desktop',
    ...overrides
  }
}

function executors(
  overrides: Partial<LocalTaskProposalExecutors> = {}
): LocalTaskProposalExecutors {
  const done = async () => ({ ok: true, detail: 'done' })
  return {
    start: vi.fn(done),
    subtask: vi.fn(done),
    append: vi.fn(done),
    stop: vi.fn(done),
    link: vi.fn(done),
    record: vi.fn(done),
    ...overrides
  }
}

describe('executeLocalTaskProposal', () => {
  beforeEach(() => {
    fixture.recordResults.mockReset()
    fixture.recordResults.mockResolvedValue({ ok: true, proposal: proposal() })
  })

  it('runs only the items the person kept and reports each one by its index', async () => {
    const run = executors()
    const results = await executeLocalTaskProposal(proposal({ keptItemIndexes: [0, 2] }), run)

    expect(run.append).not.toHaveBeenCalled()
    expect(results).toEqual([
      { index: 0, ok: true, detail: 'done' },
      { index: 2, ok: true, detail: 'done' }
    ])
    expect(fixture.recordResults).toHaveBeenCalledWith('proposal-1', results)
  })

  it('turns a throwing item into a failed result and keeps running the rest', async () => {
    const run = executors({
      append: vi.fn(async () => {
        throw new Error('runtime went away')
      })
    })
    const results = await executeLocalTaskProposal(proposal(), run)

    expect(results?.map((result) => [result.index, result.ok, result.detail])).toEqual([
      [0, true, 'done'],
      [1, false, 'runtime went away'],
      [2, true, 'done']
    ])
  })

  it('returns null when the library refuses the results', async () => {
    fixture.recordResults.mockResolvedValue({ ok: false, code: 'stale', detail: 'executed' })

    expect(await executeLocalTaskProposal(proposal(), executors())).toBeNull()
  })
})

function project(id: string, name: string, prefix: string, repos: string[]): LocalTaskProject {
  return {
    id,
    name,
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

describe('resolveProposalProject', () => {
  const shop = project('p-shop', 'Shop', 'SHOP', ['github:acme/shop'])
  const docs = project('p-docs', 'Docs', 'DOC', ['github:acme/docs'])
  const paired = project('runtime:env-1/p-api', 'API', 'API', ['github:acme/shop'])

  it('takes the project the item names by name or prefix', () => {
    expect(resolveProposalProject([shop, docs], 'doc', null)).toBe(docs)
    expect(resolveProposalProject([shop, docs], 'shop', null)).toBe(shop)
  })

  it('takes the one project holding the target, and ignores a paired library', () => {
    expect(
      resolveProposalProject([shop, docs, paired], undefined, new Set(['github:acme/shop']))
    ).toBe(shop)
  })

  it("puts a task for a workspace on another host in that host's library", () => {
    expect(
      resolveProposalProject(
        [shop, docs, paired],
        undefined,
        new Set(['github:acme/shop']),
        'runtime:env-1'
      )
    ).toBe(paired)
    expect(
      resolveProposalProject(
        [shop, docs],
        undefined,
        new Set(['github:acme/shop']),
        'runtime:env-1'
      )
    ).toEqual({ miss: expect.stringContaining('no task project here tracks this repository') })
  })

  it('asks instead of guessing when several projects could take the task', () => {
    const shop2 = project('p-shop-2', 'Shop ops', 'OPS', ['github:acme/shop'])
    expect(resolveProposalProject([shop, shop2], undefined, new Set(['github:acme/shop']))).toEqual(
      {
        miss: expect.stringContaining('name the task project')
      }
    )
    expect(resolveProposalProject([shop, docs], 'billing', null)).toEqual({
      miss: expect.stringContaining('billing')
    })
  })
})
