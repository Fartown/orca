#!/usr/bin/env node
// Upstream change report for fork maintainers: which upstream commits, between the commit the
// fork last merged and the upstream tip, touched a fork feature's seams or the upstream modules
// it depends on (config/fork-features.jsonc). Reading 300 upstream commits is not realistic;
// reading the dozen that touch what we lean on is. Used by `pnpm sync:upstream` and the weekly
// sync workflow, printed as Markdown.
//
// Usage: node config/scripts/report-upstream-seam-changes.mjs [<upstream ref>] [--from <ref>]
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { loadForkFeatureRegistry } from './check-fork-features.mjs'
import { matchesAnyPathPattern, normalizeRepositoryPath } from './architecture-policy-matching.mjs'

function git(root, argv) {
  const result = spawnSync('git', argv, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  })
  if (result.status !== 0) {
    throw new Error(`git ${argv.join(' ')} failed:\n${result.stderr || result.stdout}`)
  }
  return result.stdout
}

/** Commits in `from..to` with the files each touched. */
export function listUpstreamCommits(root, from, to) {
  const raw = git(root, ['log', '--format=%x00%h %s', '--name-only', `${from}..${to}`])
  const commits = []
  for (const block of raw.split('\0').slice(1)) {
    const [head, ...files] = block.split('\n')
    const [sha, ...subject] = head.split(' ')
    commits.push({
      sha,
      subject: subject.join(' '),
      files: files.filter(Boolean).map(normalizeRepositoryPath)
    })
  }
  return commits
}

export function watchedPatterns(feature) {
  return [...feature.seams.map((seam) => seam.file), ...(feature.dependsOn ?? [])]
}

/** Pure: commits grouped per feature by the watched paths they touched. */
export function seamChangeReport(registry, commits, { from, to }) {
  const lines = [`## Upstream changes touching fork seams and dependencies (${from}..${to})`, '']
  let any = false
  for (const feature of registry.features) {
    const patterns = watchedPatterns(feature)
    const hits = commits
      .map((commit) => ({
        ...commit,
        touched: commit.files.filter((file) => matchesAnyPathPattern(file, patterns))
      }))
      .filter((commit) => commit.touched.length > 0)
    if (hits.length === 0) {
      continue
    }
    any = true
    lines.push(`### ${feature.id}`, '')
    for (const commit of hits) {
      lines.push(`- \`${commit.sha}\` ${commit.subject}`)
      for (const file of commit.touched.slice(0, 8)) {
        lines.push(`  - ${file}`)
      }
      if (commit.touched.length > 8) {
        lines.push(`  - … ${commit.touched.length - 8} more`)
      }
    }
    lines.push('')
  }
  if (!any) {
    lines.push(
      `${commits.length} upstream commit(s); none touched a registered seam or dependency.`,
      ''
    )
  }
  return lines.join('\n')
}

export function renderSeamChangeReport(root, registry, toRef, fromRef = null) {
  const from = fromRef ?? git(root, ['merge-base', toRef, 'HEAD']).trim()
  const commits = listUpstreamCommits(root, from, toRef)
  return seamChangeReport(registry, commits, { from: from.slice(0, 9), to: toRef })
}

function main(argv) {
  const root = path.resolve(import.meta.dirname, '..', '..')
  const registry = loadForkFeatureRegistry(root)
  const fromIndex = argv.indexOf('--from')
  const fromRef = fromIndex === -1 ? null : (argv[fromIndex + 1] ?? null)
  const toRef =
    argv.find((arg, index) => !arg.startsWith('--') && argv[index - 1] !== '--from') ??
    `${registry.upstream.remote}/${registry.upstream.branch}`
  process.stdout.write(`${renderSeamChangeReport(root, registry, toRef, fromRef)}\n`)
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  process.exitCode = main(process.argv.slice(2))
}
