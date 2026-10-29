import { describe, expect, it, vi } from 'vitest'
import { createTestStore } from '@/store/slices/store-test-helpers'
import { makeWorktree } from '@/store/slices/worktrees-slice-test-fixtures'
import type { AppState } from '@/store/types'
import type { HostedReviewInfo } from '../../../shared/hosted-review'
import type { SshConnectionState } from '../../../shared/ssh-types'
import type {
  LocalTaskLinks,
  LocalTaskWorkspaceLink
} from '../../../shared/local-tasks/local-task-link-types'
import type { LocalTask, LocalTaskProject } from '../../../shared/local-tasks/local-task-types'
import { findLocalTaskPrMergedTriggers } from './local-task-link-maintenance'
import { selectLocalTaskWorkspace } from './local-task-workspace-resolution'
import { localTaskMergedReview, localTaskReviewKeys } from './local-task-workspace-review'

vi.mock('../hooks/ipc-events/runtime-environment-subscription-selection', async (original) => ({
  ...(await original<object>()),
  getReachableRuntimeEnvironmentIds: () => ['vm']
}))

const REPO = { id: 'repo1', path: '/repo1', displayName: 'Shop', badgeColor: '#000', addedAt: 0 }
const SSH_REPO = { ...REPO, connectionId: 'minizc' }
const WORKTREE_ID = 'repo1::/repo1/shop-12'

function ssh(status: SshConnectionState['status']): Map<string, SshConnectionState> {
  return new Map([['minizc', { targetId: 'minizc', status, error: null, reconnectAttempt: 0 }]])
}

function workspaceLink(overrides: Partial<LocalTaskWorkspaceLink> = {}): LocalTaskWorkspaceLink {
  return {
    taskId: 'task-12',
    hostId: 'local',
    kind: 'git-worktree',
    instanceId: null,
    worktreeId: WORKTREE_ID,
    folderWorkspaceId: null,
    repoId: 'repo1',
    branchSnapshot: 'shop-12',
    nameSnapshot: 'shop-12',
    hostLabelSnapshot: null,
    linkedVia: 'start',
    linkedAt: 1,
    ...overrides
  }
}

function state(patch: Partial<AppState>): AppState {
  const store = createTestStore()
  store.setState(patch)
  return store.getState()
}

describe('workspace deleted', () => {
  it('is missing only when the repo’s own host listed it authoritatively without it', () => {
    const listing = (authoritative: boolean): Partial<AppState> => ({
      repos: [REPO],
      detectedWorktreesByRepo: {
        repo1: { repoId: 'repo1', authoritative, source: 'git', worktrees: [] }
      }
    })
    expect(selectLocalTaskWorkspace(state(listing(true)), workspaceLink())).toBe('missing')
    // A fallback listing proves nothing about the host's checkouts.
    expect(selectLocalTaskWorkspace(state(listing(false)), workspaceLink())).toBe('unverifiable')
  })

  it('never calls an SSH workspace deleted while its host is out of contact', () => {
    const patch: Partial<AppState> = {
      repos: [SSH_REPO],
      detectedWorktreesByRepo: {
        repo1: { repoId: 'repo1', authoritative: true, source: 'git', worktrees: [] }
      }
    }
    const link = workspaceLink({ hostId: 'ssh:minizc' })
    expect(
      selectLocalTaskWorkspace(state({ ...patch, sshConnectionStates: ssh('disconnected') }), link)
    ).toBe('unverifiable')
    expect(
      selectLocalTaskWorkspace(state({ ...patch, sshConnectionStates: ssh('connected') }), link)
    ).toBe('missing')
  })

  it('finds a workspace that moved hosts by its durable instance id', () => {
    const moved = makeWorktree({
      id: 'repo1::/srv/shop-12',
      repoId: 'repo1',
      hostId: 'ssh:minizc',
      instanceId: 'instance-12'
    })
    const found = selectLocalTaskWorkspace(
      state({
        repos: [SSH_REPO],
        worktreesByRepo: { repo1: [moved] },
        sshConnectionStates: ssh('connected')
      }),
      workspaceLink({ hostId: 'runtime:old-server', instanceId: 'instance-12' })
    )
    expect(found).toBe(moved)
  })
})

function review(overrides: Partial<HostedReviewInfo>): HostedReviewInfo {
  return {
    provider: 'github',
    number: 42,
    title: 'Export',
    state: 'merged',
    url: 'https://example.com/pr/42',
    status: 'success',
    updatedAt: '2026-10-26T00:00:00Z',
    mergeable: 'UNKNOWN',
    headSha: 'head-a',
    ...overrides
  }
}

describe('PR merged rule (REQ-013)', () => {
  it('fires only for a merged review at the workspace head', () => {
    expect(localTaskMergedReview(review({}), { head: 'head-a' })).toEqual({
      provider: 'github',
      prNumber: 42,
      headSha: 'head-a'
    })
    // A reused branch name with new commits is not that PR's line of work.
    expect(localTaskMergedReview(review({}), { head: 'head-b' })).toBeNull()
    expect(localTaskMergedReview(review({ state: 'open' }), { head: 'head-a' })).toBeNull()
  })

  it('accepts a contained head on GitHub but needs the exact sha elsewhere', () => {
    expect(
      localTaskMergedReview(review({ confirmedContainedHeadOid: 'head-b' }), { head: 'head-b' })
    ).not.toBeNull()
    expect(
      localTaskMergedReview(review({ provider: 'gitlab', confirmedContainedHeadOid: 'head-b' }), {
        head: 'head-b'
      })
    ).toBeNull()
    expect(localTaskMergedReview(review({ provider: 'gitlab' }), { head: 'head-a' })).toEqual({
      provider: 'gitlab',
      prNumber: 42,
      headSha: 'head-a'
    })
  })

  it('skips a project with the rule off and a task already done', () => {
    const worktree = makeWorktree({ id: WORKTREE_ID, repoId: 'repo1', head: 'head-a' })
    const statuses = [
      {
        id: 'started',
        projectId: 'p',
        category: 'started' as const,
        name: 'Doing',
        color: 'yellow' as const,
        position: 0
      },
      {
        id: 'done',
        projectId: 'p',
        category: 'completed' as const,
        name: 'Done',
        color: 'green' as const,
        position: 1
      }
    ]
    const project = (prMergedCompletes: boolean): LocalTaskProject => ({
      id: 'p',
      name: 'Shop',
      prefix: 'SHOP',
      aliases: [],
      repos: ['orca-shop'],
      defaultRepoId: 'orca-shop',
      lastExecutionHostId: null,
      rules: { startMovesToInProgress: true, prMergedCompletes },
      statuses,
      createdAt: 0,
      updatedAt: 0,
      revision: 1
    })
    const task = (statusId: string, parentId: string | null = null): LocalTask => ({
      id: 'task-12',
      projectId: 'p',
      number: 12,
      ref: 'SHOP-12',
      title: 'Export',
      description: '',
      criteria: [],
      statusId,
      priority: 0,
      labels: [],
      parentId,
      createdAt: 0,
      updatedAt: 0,
      revision: 1
    })
    const base = state({ repos: [REPO], worktreesByRepo: { repo1: [worktree] } })
    const { hostedReviewKey } = localTaskReviewKeys(worktree, REPO, base.settings)
    const merged = state({
      repos: [REPO],
      worktreesByRepo: { repo1: [worktree] },
      // A neutral branch lookup ('' hint) is what the sidebar card shows for an unlinked PR.
      hostedReviewCache: {
        [hostedReviewKey]: { data: review({}), fetchedAt: 1, linkedReviewHintKey: '' }
      }
    })
    const links: LocalTaskLinks = { workspaces: [workspaceLink()], sessions: [] }
    expect(
      findLocalTaskPrMergedTriggers(merged, {
        links,
        tasks: [task('started')],
        projects: [project(true)]
      })
    ).toEqual([{ taskId: 'task-12', provider: 'github', prNumber: 42, headSha: 'head-a' }])
    // Any level may hold its own workspace (D-008); the rule acts on the task that holds it.
    expect(
      findLocalTaskPrMergedTriggers(merged, {
        links,
        tasks: [task('started', 'task-1')],
        projects: [project(true)]
      })
    ).toEqual([{ taskId: 'task-12', provider: 'github', prNumber: 42, headSha: 'head-a' }])
    expect(
      findLocalTaskPrMergedTriggers(merged, {
        links,
        tasks: [task('done')],
        projects: [project(true)]
      })
    ).toEqual([])
    expect(
      findLocalTaskPrMergedTriggers(merged, {
        links,
        tasks: [task('started')],
        projects: [project(false)]
      })
    ).toEqual([])
  })
})
