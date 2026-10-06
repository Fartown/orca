// What a build changed since the previous build, and whether it also gets a milestone release.
import { integrationTag } from './build-identity.mjs'
import { integrationReleasesOf } from './integration-releases.mjs'
import { milestonesOf, planMilestone } from './milestone-release.mjs'
import { classifyCommit, readFirstParentCommits } from './release-notes.mjs'
import {
  fallbackSyncSummary,
  listOfficialReleases,
  summarizeUpstreamSync
} from './upstream-summary.mjs'

const MAX_BUILD_COMMITS = 100

function previousIntegrationRelease(builds, sha, runId) {
  return builds
    .filter(
      (release) =>
        release.run < Number(runId) &&
        /^[a-f0-9]{40}$/.test(release.target_commitish) &&
        release.target_commitish !== sha
    )
    .sort((a, b) => b.run - a.run)[0]
}

// First-parent history keeps upstream commits brought in by a sync merge out of the list.
export function listMergedChanges({ builds, git, sha, runId }) {
  const changes = (range, count) => readFirstParentCommits(git, range, count).map(classifyCommit)
  try {
    const previous = previousIntegrationRelease(builds, sha, runId)
    if (previous) {
      git(['merge-base', '--is-ancestor', previous.target_commitish, sha])
      return {
        previous,
        changes: changes(`${previous.target_commitish}..${sha}`, MAX_BUILD_COMMITS)
      }
    }
  } catch (error) {
    console.warn(`Could not compare with the previous integration release: ${error.message}`)
  }
  return { previous: null, changes: changes(sha, 1) }
}

export function releaseContext({ gh, git, releases, sha, runId, milestoneRequested }) {
  const tag = integrationTag(sha, runId)
  const builds = integrationReleasesOf(releases).filter((release) => release.tag_name !== tag)
  const merged = listMergedChanges({ builds, git, sha, runId })
  const milestones = milestonesOf(releases)
  const plan = planMilestone({
    git,
    sha,
    buildChanges: merged.changes,
    milestones,
    requested: milestoneRequested
  })
  const syncs = [...merged.changes, ...(plan?.changes ?? [])].filter(
    (change) => change.kind === 'sync'
  )
  const officialReleases = syncs.length ? listOfficialReleases(gh) : []
  const summaries = new Map()
  for (const sync of syncs) {
    if (summaries.has(sync.sha)) {
      continue
    }
    try {
      summaries.set(sync.sha, summarizeUpstreamSync({ git, sync, officialReleases }))
    } catch (error) {
      console.warn(`Could not summarize upstream sync ${sync.sha}: ${error.message}`)
      summaries.set(sync.sha, fallbackSyncSummary(sync))
    }
  }
  return {
    tag,
    builds,
    previous: merged.previous,
    buildChanges: merged.changes,
    milestones,
    plan,
    syncSummariesOf: (changes) =>
      changes.filter((change) => change.kind === 'sync').map((change) => summaries.get(change.sha))
  }
}
