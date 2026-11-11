import { z } from 'zod'
import { LOCAL_EXECUTION_HOST_ID } from '../../../src/shared/execution-host'
import type { CheckStatus } from '../../../src/shared/github/pull-request-types'
import type { LocalTaskWorkspaceLink } from '../../../src/shared/local-tasks/local-task-link-types'
import { localTaskLinkWorkspaceId } from '../../../src/shared/local-tasks/local-task-workspace-match'
import { getRepoIdFromWorktreeId, worktreeIdsEqual } from '../../../src/shared/worktree/id'
import { salvagedOptional, salvagingArray } from '../../../src/shared/zod-salvage'

/** What the task's workspace card shows of the host's own row: its review, as the host has it. */
export type LocalTaskWorkspaceReview = {
  kind: 'pr' | 'mr'
  number: number
  /** `open`, `merged`, `closed`, `draft`, or `unknown` when the host has only the number. */
  state: string
  checks: CheckStatus | null
}

/**
 * Where a linked workspace is now, judged from one `worktree.ps` of the library's host: its row, or
 * `missing` only when that host listed the repo there and not the workspace (a host's own word, as
 * the desktop requires), else `unverifiable`.
 */
export type LocalTaskWorkspaceVerdict =
  | { kind: 'found'; review: LocalTaskWorkspaceReview | null }
  | { kind: 'missing' }
  | { kind: 'unverifiable' }

const rowSchema = z.looseObject({
  worktreeId: z.string().min(1),
  repoId: z.string(),
  hostId: salvagedOptional('hostId', z.string()),
  worktreeInstanceId: salvagedOptional('worktreeInstanceId', z.string()),
  linkedPR: salvagedOptional(
    'linkedPR',
    z
      .looseObject({
        number: z.number(),
        state: z.string(),
        checksStatus: salvagedOptional(
          'checksStatus',
          z.enum(['pending', 'success', 'failure', 'neutral'])
        )
      })
      .nullable()
  ),
  linkedGitLabMR: salvagedOptional('linkedGitLabMR', z.number().nullable())
})

type Row = z.output<typeof rowSchema>

const listingSchema = z.looseObject({
  worktrees: salvagedOptional('worktrees', salvagingArray(rowSchema)),
  truncated: salvagedOptional('truncated', z.boolean()),
  hostScope: salvagedOptional('hostScope', z.looseObject({ hostIds: salvagingArray(z.string()) }))
})

/** One full `worktree.ps` as the verdict reads it; null for an unchanged or unreadable reply. */
export type LocalTaskWorkspaceListing = {
  rows: Row[]
  /** False when the host cut the page, so an absent row proves nothing. */
  complete: boolean
  /** Hosts the page has rows for; empty from a host too old to say. */
  coveredHostIds: ReadonlySet<string>
}

export function readLocalTaskWorkspaceListing(reply: unknown): LocalTaskWorkspaceListing | null {
  const parsed = listingSchema.safeParse(reply)
  if (!parsed.success || !parsed.data.worktrees) {
    return null
  }
  return {
    rows: parsed.data.worktrees,
    complete: parsed.data.truncated === false,
    coveredHostIds: new Set(parsed.data.hostScope?.hostIds ?? [])
  }
}

function rowHost(row: Row): string {
  return row.hostId ?? LOCAL_EXECUTION_HOST_ID
}

function reviewOf(row: Row): LocalTaskWorkspaceReview | null {
  if (row.linkedPR) {
    return {
      kind: 'pr',
      number: row.linkedPR.number,
      state: row.linkedPR.state,
      checks: row.linkedPR.checksStatus ?? null
    }
  }
  return typeof row.linkedGitLabMR === 'number'
    ? { kind: 'mr', number: row.linkedGitLabMR, state: 'unknown', checks: null }
    : null
}

/**
 * The verdict for one link, matched as the desktop matches it: by its durable instance first, then
 * by host and id. `hostInContact` is the library host's own answer for the workspace's host; a host
 * it cannot reach never proves a workspace gone.
 */
export function localTaskWorkspaceVerdict(
  link: Pick<
    LocalTaskWorkspaceLink,
    'hostId' | 'kind' | 'instanceId' | 'worktreeId' | 'folderWorkspaceId' | 'repoId'
  >,
  listing: LocalTaskWorkspaceListing,
  hostInContact: boolean
): LocalTaskWorkspaceVerdict {
  const workspaceId = localTaskLinkWorkspaceId(link)

  // Archived rows count: an archived workspace still exists.
  const rows = listing.rows
  const row =
    (link.kind === 'git-worktree' && link.instanceId
      ? rows.find((candidate) => candidate.worktreeInstanceId === link.instanceId)
      : undefined) ??
    (workspaceId
      ? rows.find(
          (candidate) =>
            rowHost(candidate) === link.hostId &&
            worktreeIdsEqual(candidate.worktreeId, workspaceId)
        )
      : undefined)
  if (row) {
    return { kind: 'found', review: reviewOf(row) }
  }
  if (!hostInContact || !workspaceId || !listing.complete) {
    return { kind: 'unverifiable' }
  }
  if (link.kind === 'folder') {
    // Why local only: a remote host's folder catalog can still be loading (as on the desktop).
    return link.hostId === LOCAL_EXECUTION_HOST_ID && listing.coveredHostIds.has(link.hostId)
      ? { kind: 'missing' }
      : { kind: 'unverifiable' }
  }
  // The repo's other rows on that host are its proof that the repo was scanned there.
  const repoId = link.repoId ?? getRepoIdFromWorktreeId(workspaceId)
  const repoListed = rows.some(
    (candidate) => candidate.repoId === repoId && rowHost(candidate) === link.hostId
  )
  return listing.coveredHostIds.has(link.hostId) && repoListed
    ? { kind: 'missing' }
    : { kind: 'unverifiable' }
}
