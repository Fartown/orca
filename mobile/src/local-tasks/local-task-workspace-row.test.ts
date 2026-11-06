import { describe, expect, it } from 'vitest'
import type { LocalTaskWorkspaceLink } from '../../../src/shared/local-tasks/local-task-link-types'
import {
  localTaskWorkspaceVerdict,
  readLocalTaskWorkspaceListing,
  type LocalTaskWorkspaceListing
} from './local-task-workspace-row'

const link: LocalTaskWorkspaceLink = {
  taskId: 't12',
  hostId: 'ssh:box',
  kind: 'git-worktree',
  instanceId: null,
  worktreeId: 'shop::/w/shop-12',
  folderWorkspaceId: null,
  repoId: 'shop',
  branchSnapshot: 'zc/shop-12',
  nameSnapshot: 'shop-12',
  hostLabelSnapshot: 'box',
  linkedVia: 'start',
  linkedAt: 1
}

const MAIN = { worktreeId: 'shop::/w/shop', repoId: 'shop', hostId: 'ssh:box' }

function listing(rows: unknown[], extra: Record<string, unknown> = {}): LocalTaskWorkspaceListing {
  const read = readLocalTaskWorkspaceListing({
    worktrees: rows,
    truncated: false,
    hostScope: { hostIds: ['ssh:box'], omittedHostIds: [] },
    ...extra
  })
  if (!read) {
    throw new Error('the listing should read')
  }
  return read
}

describe('where a linked workspace is now', () => {
  it("reads the host's PR and checks off the workspace's own row", () => {
    const row = {
      ...MAIN,
      worktreeId: 'shop::/w/shop-12',
      linkedPR: { number: 231, state: 'open', checksStatus: 'failure' }
    }
    expect(localTaskWorkspaceVerdict(link, listing([MAIN, row]), true)).toEqual({
      kind: 'found',
      review: { kind: 'pr', number: 231, state: 'open', checks: 'failure' }
    })
  })

  it('calls it deleted only when its host listed the repo there and not the workspace', () => {
    expect(localTaskWorkspaceVerdict(link, listing([MAIN]), true)).toEqual({ kind: 'missing' })
    // The repo was never listed on that host (its scan may have failed): nothing is proved.
    expect(localTaskWorkspaceVerdict(link, listing([]), true)).toEqual({ kind: 'unverifiable' })
    // A cut page, or a host too old to say whether it cut one, proves nothing either.
    expect(localTaskWorkspaceVerdict(link, listing([MAIN], { truncated: true }), true)).toEqual({
      kind: 'unverifiable'
    })
    expect(
      localTaskWorkspaceVerdict(link, listing([MAIN], { truncated: undefined }), true)
    ).toEqual({ kind: 'unverifiable' })
  })

  it('never calls a workspace on a host out of contact deleted', () => {
    expect(localTaskWorkspaceVerdict(link, listing([MAIN]), false)).toEqual({
      kind: 'unverifiable'
    })
  })

  it('follows a workspace that moved to another host by its durable instance', () => {
    const moved = {
      ...MAIN,
      worktreeId: 'shop::/w/shop-12',
      hostId: 'local',
      worktreeInstanceId: 'i1'
    }
    expect(
      localTaskWorkspaceVerdict({ ...link, instanceId: 'i1' }, listing([MAIN, moved]), true)
    ).toEqual({ kind: 'found', review: null })
  })
})
