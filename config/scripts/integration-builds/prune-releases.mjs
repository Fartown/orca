// Keeps the releases page short: only the newest build releases survive, plus any a milestone links to.
export const KEPT_BUILD_RELEASES = 10
const BUILD_TAG_REFERENCE = /integration-[1-9]\d*-[a-f0-9]{12}/g

/**
 * Build releases to delete. `builds` come from listIntegrationReleases (published prereleases with
 * a run id); milestone bodies protect the build their install link points at.
 */
export function selectPrunableBuilds({ builds, milestones, keep = KEPT_BUILD_RELEASES }) {
  const referenced = new Set(
    milestones.flatMap((milestone) => milestone.body?.match(BUILD_TAG_REFERENCE) ?? [])
  )
  return [...builds]
    .sort((a, b) => b.run - a.run)
    .slice(keep)
    .filter((release) => !referenced.has(release.tag_name))
}

/** Deletes each release with its tag; a failure is reported and never fails the publish. */
export function pruneBuildReleases({ gh, repo, builds, milestones, keep }) {
  const prunable = selectPrunableBuilds({ builds, milestones, keep })
  const deleted = []
  for (const release of prunable) {
    try {
      gh(['release', 'delete', release.tag_name, '--repo', repo, '--cleanup-tag', '--yes'])
      deleted.push(release.tag_name)
    } catch (error) {
      console.log(`::warning::Could not delete ${release.tag_name}: ${error.message}`)
    }
  }
  if (deleted.length) {
    console.log(`Pruned ${deleted.length} older build release(s): ${deleted.join(', ')}`)
  }
  return deleted
}
