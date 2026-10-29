import type { AppState } from '@/store/types'
import { getHostedReviewCacheKey } from '@/store/slices/hosted-review-cache-identity'
import { getIndexedRepoMap } from '@/store/worktree-repo-index'
import { getDetachedWorkspaceReviewRequest } from '@/components/sidebar/workspace-detached-review-request'
import {
  isCachedMergedBranchPRCurrentForWorktree,
  type WorktreeCardPrDisplay
} from '@/components/sidebar/worktree-card-pr-display'
import { resolveWorktreeCardReview } from '@/components/sidebar/use-worktree-card-review-details'
import { getGitHubPRCacheKey } from '../../../shared/github/github-cache-key'
import type { HostedReviewInfo } from '../../../shared/hosted-review'
import { getWorktreeGitIdentityDisplay } from '../../../shared/worktree/git-identity-display'
import type { Repo } from '../../../shared/repo-types'
import type { Worktree } from '../../../shared/worktree/types'

type HostedEntry = AppState['hostedReviewCache'][string] | undefined
type PrEntry = AppState['prCache'][string] | undefined

export type LocalTaskReviewKeys = { hostedReviewKey: string; prCacheKey: string }

/** The same cache keys the sidebar card reads for this workspace. */
export function localTaskReviewKeys(
  worktree: Worktree,
  repo: Repo | undefined,
  settings: AppState['settings']
): LocalTaskReviewKeys {
  const identity = getWorktreeGitIdentityDisplay(worktree)
  const branch = identity?.kind === 'branch' ? identity.branchName : ''
  const exactKey = getDetachedWorkspaceReviewRequest(worktree, repo)?.key
  const hostedReviewKey =
    exactKey ??
    (repo && branch
      ? getHostedReviewCacheKey(
          repo.path,
          branch,
          settings,
          repo.id,
          repo.connectionId,
          repo.executionHostId,
          true
        )
      : '')
  const prCacheKey =
    repo && branch
      ? getGitHubPRCacheKey(
          repo.path,
          repo.id,
          branch,
          settings,
          repo.connectionId,
          repo.executionHostId,
          true
        )
      : ''
  return { hostedReviewKey, prCacheKey }
}

export function localTaskRepoForWorktree(state: AppState, worktree: Worktree): Repo | undefined {
  return getIndexedRepoMap(state.repos).get(worktree.repoId)
}

/** The review the sidebar card shows for a workspace, by the card's own rule. */
export function resolveLocalTaskReview(
  worktree: Worktree,
  hostedEntry: HostedEntry,
  prEntry: PrEntry
): WorktreeCardPrDisplay | null {
  return resolveWorktreeCardReview(worktree, hostedEntry, prEntry).prDisplay
}

export function selectLocalTaskReview(
  state: AppState,
  worktree: Worktree
): WorktreeCardPrDisplay | null {
  const keys = localTaskReviewKeys(
    worktree,
    localTaskRepoForWorktree(state, worktree),
    state.settings
  )
  return resolveLocalTaskReview(
    worktree,
    keys.hostedReviewKey ? state.hostedReviewCache[keys.hostedReviewKey] : undefined,
    keys.prCacheKey ? state.prCache?.[keys.prCacheKey] : undefined
  )
}

function isLoadedReview(review: WorktreeCardPrDisplay): review is HostedReviewInfo {
  return 'mergeable' in review
}

export type LocalTaskMergedReview = { provider: string; prNumber: number; headSha: string }

/**
 * The merge that completes a task (REQ-013 rule 2): a loaded review in state `merged` whose head is
 * this workspace's head. GitHub also accepts a head the merged PR is confirmed to contain; other
 * providers report no containment, so their head must equal the review's sha.
 */
export function localTaskMergedReview(
  review: WorktreeCardPrDisplay | null,
  worktree: Pick<Worktree, 'head'>
): LocalTaskMergedReview | null {
  if (
    !review ||
    !isLoadedReview(review) ||
    review.provider === 'unsupported' ||
    !isCachedMergedBranchPRCurrentForWorktree(review, worktree) ||
    !review.headSha
  ) {
    return null
  }
  if (review.provider !== 'github' && review.headSha !== worktree.head) {
    return null
  }
  return { provider: review.provider, prNumber: review.number, headSha: review.headSha }
}
