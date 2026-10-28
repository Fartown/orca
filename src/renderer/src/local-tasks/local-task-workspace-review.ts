import type { AppState } from '@/store/types'
import { getHostedReviewCacheKey } from '@/store/slices/hosted-review-cache-identity'
import { getIndexedRepoMap } from '@/store/worktree-repo-index'
import { getDetachedWorkspaceReviewRequest } from '@/components/sidebar/workspace-detached-review-request'
import {
  getWorktreeCardPrDisplay,
  isCachedMergedBranchPRCurrentForWorktree,
  type WorktreeCardPrDisplay
} from '@/components/sidebar/worktree-card-pr-display'
import { getGitHubPRCacheKey } from '../../../shared/github/github-cache-key'
import { hostedReviewInfoFromGitHubPRInfo } from '../../../shared/hosted-review-github'
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

/**
 * The review the sidebar card shows for a workspace, from the same two caches and the same rule:
 * a merged branch PR counts only while the workspace head still belongs to it.
 */
export function resolveLocalTaskReview(
  worktree: Worktree,
  hostedEntry: HostedEntry,
  prEntry: PrEntry
): WorktreeCardPrDisplay | null {
  const hostedReview = hostedEntry === undefined ? undefined : hostedEntry.data
  const links = {
    github: worktree.linkedPR ?? null,
    gitlab: worktree.linkedGitLabMR ?? null,
    bitbucket: worktree.linkedBitbucketPR ?? null,
    azure: worktree.linkedAzureDevOpsPR ?? null,
    gitea: worktree.linkedGiteaPR ?? null
  }
  const hasNonGitHubLink =
    links.gitlab !== null ||
    links.bitbucket !== null ||
    links.azure !== null ||
    links.gitea !== null
  const hasLink = links.github !== null || hasNonGitHubLink
  const cachedPR = prEntry?.data
  const mergedMatchesHead = isCachedMergedBranchPRCurrentForWorktree(cachedPR, worktree)
  const hostedMatchesCachedMerged =
    mergedMatchesHead &&
    cachedPR != null &&
    hostedReview?.provider === 'github' &&
    hostedReview.number === cachedPR.number
  const useCachedPR =
    cachedPR != null &&
    !hasNonGitHubLink &&
    (cachedPR.state !== 'merged' || mergedMatchesHead) &&
    (hostedReview === undefined ||
      (mergedMatchesHead && !hostedMatchesCachedMerged) ||
      (hostedReview === null &&
        ((prEntry?.fetchedAt ?? 0) > (hostedEntry?.fetchedAt ?? 0) || mergedMatchesHead)))
  const review = useCachedPR ? hostedReviewInfoFromGitHubPRInfo(cachedPR) : hostedReview
  const branchLookupGitHubPRNumber =
    hostedReview?.provider === 'github' &&
    hostedReview.state === 'merged' &&
    !isCachedMergedBranchPRCurrentForWorktree(hostedReview, worktree)
      ? null
      : hostedEntry?.branchLookupGitHubPRNumber
  return getWorktreeCardPrDisplay(
    review,
    links.github,
    links.gitlab,
    links.bitbucket,
    links.azure,
    links.gitea,
    {
      reviewHintKey:
        (useCachedPR || mergedMatchesHead) && !hasLink ? '' : hostedEntry?.linkedReviewHintKey,
      branchLookupGitHubPRNumber,
      suppressedGitHubPR: worktree.suppressedGitHubPR ?? null
    }
  )
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
