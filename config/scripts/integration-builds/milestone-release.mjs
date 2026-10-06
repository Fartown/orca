// Milestone releases: one readable page per upstream sync (or on request) that points at a build.
import { writeFileSync } from 'node:fs'
import { classifyCommit, readFirstParentCommits, renderChangeSections } from './release-notes.mjs'
import { compareVersions } from './upstream-summary.mjs'

const MILESTONE_TAG = /^fork-v(\d+\.\d+\.\d+)-([1-9]\d*)$/
const MAX_MILESTONE_COMMITS = 200
export const AI_SUMMARY_LABEL = '> 以下短版本由 AI 生成，未经人工审阅。'

/** Published milestone releases, each with its upstream version and sequence number. */
export function milestonesOf(releases) {
  return releases.flatMap((release) => {
    const match = release?.tag_name?.match(MILESTONE_TAG)
    return match && !release.draft
      ? [{ ...release, upstreamVersion: match[1], sequence: Number(match[2]) }]
      : []
  })
}

/**
 * The newest official upstream release the milestone contains: the latest one published during its
 * syncs, else the previous milestone's, else the package version.
 */
export function milestoneUpstreamVersion({ syncSummaries, previous, packageVersion }) {
  const versions = syncSummaries
    .flatMap((summary) => summary.releases.map((release) => release.tag.slice(1)))
    .sort(compareVersions)
  return versions.at(-1) ?? previous?.upstreamVersion ?? packageVersion
}

export function nextMilestone(upstreamVersion, milestones) {
  const sequence =
    Math.max(
      0,
      ...milestones
        .filter((milestone) => milestone.upstreamVersion === upstreamVersion)
        .map((milestone) => milestone.sequence)
    ) + 1
  return {
    tag: `fork-v${upstreamVersion}-${sequence}`,
    title: `Orca 集成版 ${upstreamVersion} · 第 ${sequence} 版`
  }
}

function isAncestor(git, ancestor, sha) {
  try {
    git(['merge-base', '--is-ancestor', ancestor, sha])
    return true
  } catch {
    return false
  }
}

/**
 * Whether this build gets a milestone and what it covers. Due when the build brings in an upstream
 * sync or one was requested. It spans everything since the previous milestone; the first one starts
 * at the newest upstream sync and covers at least this build's own range.
 */
export function planMilestone({ git, sha, buildChanges, milestones, requested }) {
  if (milestones.some((milestone) => milestone.target_commitish === sha)) {
    return null
  }
  if (!requested && !buildChanges.some((change) => change.kind === 'sync')) {
    return null
  }
  const previous = milestones
    .filter((milestone) => isAncestor(git, milestone.target_commitish, sha))
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))[0]
  if (previous) {
    return {
      previous,
      changes: readFirstParentCommits(
        git,
        `${previous.target_commitish}..${sha}`,
        MAX_MILESTONE_COMMITS
      ).map(classifyCommit)
    }
  }
  const recent = readFirstParentCommits(git, sha, MAX_MILESTONE_COMMITS).map(classifyCommit)
  const newestSync = recent.findIndex((change) => change.kind === 'sync')
  return {
    previous: null,
    changes: recent.slice(0, Math.max(newestSync + 1, buildChanges.length))
  }
}

export function milestoneNotes({ repo, plan, features, syncSummaries, aiSummary, build, sha }) {
  const sections = []
  if (aiSummary) {
    sections.push(`## 短版本\n\n${AI_SUMMARY_LABEL}\n\n${aiSummary}`)
  }
  sections.push(...renderChangeSections({ changes: plan.changes, features, syncSummaries }))
  const since = plan.previous
    ? `\n- 上一个整理版：[${plan.previous.name}](${plan.previous.html_url})，[完整提交差异](https://github.com/${repo}/compare/${plan.previous.target_commitish}...${sha})`
    : ''
  sections.push(
    `## 安装\n\n- 安装包在 [Orca ${build.version}](https://github.com/${repo}/releases/tag/${build.tag})（${build.tag}）；已安装的集成版会在应用内收到更新。${since}`
  )
  return `${sections.join('\n\n')}\n`
}

/** Creates the milestone as the repository's Latest release; it carries no packages. */
export function publishMilestone({ gh, repo, sha, upstreamVersion, milestones, notes, notesPath }) {
  const { tag, title } = nextMilestone(upstreamVersion, milestones)
  writeFileSync(notesPath, notes)
  gh([
    'release',
    'create',
    tag,
    '--repo',
    repo,
    '--target',
    sha,
    '--latest',
    '--title',
    title,
    '--notes-file',
    notesPath
  ])
  console.log(`https://github.com/${repo}/releases/tag/${tag}`)
  return tag
}
