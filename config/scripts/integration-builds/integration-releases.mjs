const INTEGRATION_TAG = /^integration-([1-9]\d*)-[a-f0-9]{12}$/
const PREVIEW_TITLE = /^Orca \d+\.\d+\.\d+-preview\.([1-9]\d*)$/

/** Every release of the repository, across every page. */
export function listReleases(gh, repo) {
  return JSON.parse(
    gh(['api', '--paginate', '--slurp', `repos/${repo}/releases?per_page=100`])
  ).flat()
}

/** Published integration prereleases, each with the run id from its tag. */
export function integrationReleasesOf(releases) {
  return releases.flatMap((release) => {
    const run = Number(release?.tag_name?.match(INTEGRATION_TAG)?.[1])
    return run && !release.draft && release.prerelease ? [{ ...release, run }] : []
  })
}

export function listIntegrationReleases(gh, repo) {
  return integrationReleasesOf(listReleases(gh, repo))
}

/**
 * Highest preview number already used. Older builds are pruned, so the count alone would hand out
 * a number again; builds from before numbering carry none and still count.
 */
export function latestPreviewNumber(releases) {
  return Math.max(
    releases.length,
    ...releases.map((release) => Number(release.name?.match(PREVIEW_TITLE)?.[1] ?? 0))
  )
}

export function integrationVersion(baseVersion, latestNumber) {
  if (!/^\d+\.\d+\.\d+$/.test(baseVersion)) {
    throw new Error(`Integration builds need a plain x.y.z package version, not ${baseVersion}.`)
  }
  if (!Number.isSafeInteger(latestNumber) || latestNumber < 0) {
    throw new Error('Expected the latest published integration build number.')
  }
  // Numbered after every earlier integration build, so each one sorts above the last.
  return `${baseVersion}-preview.${latestNumber + 1}`
}
