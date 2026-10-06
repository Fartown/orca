// What an upstream sync merge brought in: the version span, its official releases and new features.
import { parseConventional } from './release-notes.mjs'

export const UPSTREAM_REPO = 'stablyai/orca'
const MAX_HIGHLIGHTS_PER_SCOPE = 3
const MAX_HIGHLIGHTS = 20
const RELEASE_TAG = /^v(\d+)\.(\d+)\.(\d+)$/

export function compareVersions(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) {
      return (pa[i] ?? 0) - (pb[i] ?? 0)
    }
  }
  return 0
}

/** Published upstream desktop releases (`vX.Y.Z`), or [] when GitHub cannot be read. */
export function listOfficialReleases(gh) {
  try {
    return JSON.parse(gh(['api', `repos/${UPSTREAM_REPO}/releases?per_page=100`])).filter(
      (release) => !release.draft && !release.prerelease && RELEASE_TAG.test(release.tag_name)
    )
  } catch (error) {
    console.warn(`Could not list upstream releases: ${error.message}`)
    return []
  }
}

function highlightsOf(git, range) {
  const byScope = new Map()
  const subjects = git(['log', '--no-merges', '--format=%s', range, '--'])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  for (const subject of subjects) {
    const { type, scopes, summary } = parseConventional(subject)
    if (type !== 'feat') {
      continue
    }
    const scope = scopes[0] ?? '通用'
    byScope.set(scope, [...(byScope.get(scope) ?? []), summary.replace(/\s*\(#\d+\)$/, '')])
  }
  const highlights = []
  let total = 0
  for (const [scope, titles] of [...byScope].sort((a, b) => b[1].length - a[1].length)) {
    const taken = titles.slice(0, Math.min(MAX_HIGHLIGHTS_PER_SCOPE, MAX_HIGHLIGHTS - total))
    if (!taken.length) {
      break
    }
    highlights.push({ scope, titles: taken, more: titles.length - taken.length })
    total += taken.length
  }
  return highlights
}

/** What the notes still say about a sync whose history could not be read. */
export function fallbackSyncSummary(sync) {
  return {
    commitCount: null,
    compareUrl: `https://github.com/${UPSTREAM_REPO}/commit/${sync.upstreamSha}`,
    releases: [],
    highlights: []
  }
}

function commitDate(git, sha) {
  return Date.parse(git(['show', '-s', '--format=%cI', sha]).trim())
}

/**
 * Summary of one sync merge (`{ baseSha, upstreamSha }`) for the release notes. Official releases
 * are cut from daily builds and main's package.json lags them, so releases are matched by publish
 * time and main's version is never shown.
 */
export function summarizeUpstreamSync({ git, sync, officialReleases = [] }) {
  const from = git(['merge-base', sync.baseSha, sync.upstreamSha]).trim()
  const range = `${from}..${sync.upstreamSha}`
  const since = commitDate(git, from)
  const until = commitDate(git, sync.upstreamSha)
  const releases = officialReleases
    .map((release) => ({
      tag: release.tag_name,
      url: release.html_url,
      body: release.body ?? '',
      publishedAt: Date.parse(release.published_at)
    }))
    .filter((release) => release.publishedAt > since && release.publishedAt <= until)
    .sort((a, b) => compareVersions(a.tag.slice(1), b.tag.slice(1)))
  return {
    commitCount: Number(git(['rev-list', '--count', '--no-merges', range]).trim()),
    compareUrl: `https://github.com/${UPSTREAM_REPO}/compare/${from}...${sync.upstreamSha}`,
    releases,
    highlights: highlightsOf(git, range)
  }
}
