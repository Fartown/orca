const INTEGRATION_TAG = /^integration-([1-9]\d*)-[a-f0-9]{12}$/

/** Published integration prereleases across every page, each with the run id from its tag. */
export function listIntegrationReleases(gh, repo) {
  const pages = JSON.parse(
    gh(['api', '--paginate', '--slurp', `repos/${repo}/releases?per_page=100`])
  )
  return pages.flat().flatMap((release) => {
    const run = Number(release?.tag_name?.match(INTEGRATION_TAG)?.[1])
    return run && !release.draft && release.prerelease ? [{ ...release, run }] : []
  })
}

export function integrationVersion(baseVersion, publishedCount) {
  if (!/^\d+\.\d+\.\d+$/.test(baseVersion)) {
    throw new Error(`Integration builds need a plain x.y.z package version, not ${baseVersion}.`)
  }
  if (!Number.isSafeInteger(publishedCount) || publishedCount < 0) {
    throw new Error('Expected the number of published integration builds.')
  }
  // Numbered after every earlier integration build, so each one sorts above the last.
  return `${baseVersion}-preview.${publishedCount + 1}`
}
