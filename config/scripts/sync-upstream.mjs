#!/usr/bin/env node
// Upstream sync for the fork: fast-forward the mirror branch to upstream, merge it into
// the integration branch, then prove every registered fork feature survived.
//
// Usage: pnpm sync:upstream [--push] [--no-checks] [--dry-run]
//   --push       push the integration branch to the fork remote once every check is green
//   --no-checks  merge only; you promise to run the gates yourself
//   --dry-run    fetch and report what would be merged; touch nothing
//
// Refuses a dirty working tree and any branch other than the integration branch, so a
// half-finished feature can never be folded into a sync commit by accident.
// See docs/reference/fork-maintenance.md.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { loadForkFeatureRegistry } from './check-fork-features.mjs'
import { forkFeatureCheckSteps } from './run-fork-feature-checks.mjs'
import { renderSeamChangeReport } from './report-upstream-seam-changes.mjs'

const root = path.resolve(import.meta.dirname, '..', '..')
const flags = new Set(process.argv.slice(2))

function git(argv, { allowFailure = false } = {}) {
  const result = spawnSync('git', argv, { cwd: root, encoding: 'utf8' })
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`git ${argv.join(' ')} failed:\n${result.stderr || result.stdout}`)
  }
  return result
}

function shell(command) {
  console.log(`\n$ ${command}`)
  const result = spawnSync(command, { cwd: root, shell: true, stdio: 'inherit' })
  return result.status ?? 1
}

function fail(message, code = 1) {
  console.error(`sync:upstream: ${message}`)
  process.exit(code)
}

function main() {
  const registry = loadForkFeatureRegistry(root)
  const { upstream, fork } = registry
  const upstreamRef = `${upstream.remote}/${upstream.branch}`
  const dryRun = flags.has('--dry-run')

  if (git(['status', '--porcelain']).stdout.trim()) {
    fail('the working tree is dirty; commit or stash first.')
  }
  const current = git(['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim()
  if (current !== fork.integrationBranch) {
    fail(`run this from ${fork.integrationBranch} (current branch: ${current}).`)
  }

  git(['fetch', upstream.remote, upstream.branch])
  const upstreamSha = git(['rev-parse', '--short', upstreamRef]).stdout.trim()
  const alreadyMerged =
    git(['merge-base', '--is-ancestor', upstreamRef, 'HEAD'], { allowFailure: true }).status === 0
  const behind = git(['rev-list', '--count', `HEAD..${upstreamRef}`]).stdout.trim()
  console.log(
    `upstream ${upstreamRef} is at ${upstreamSha}; ${behind} commit(s) not in ${fork.integrationBranch}.`
  )
  if (!alreadyMerged) {
    // Why before merging: the merge-base moves once the merge lands, and this is the list a
    // maintainer actually needs to read out of a few hundred upstream commits.
    console.log(`\n${renderSeamChangeReport(root, registry, upstreamRef)}`)
  }
  if (dryRun) {
    console.log(alreadyMerged ? 'Nothing to merge.' : 'Would merge; re-run without --dry-run.')
    return 0
  }

  // Why fetch into the local mirror instead of checking it out: `main` must stay a pure
  // upstream mirror, and a fast-forward-only ref update cannot pick up local edits.
  git(['fetch', '.', `${upstreamRef}:${upstream.branch}`])
  git(['push', fork.remote, `${upstream.branch}:${upstream.branch}`])
  console.log(`${upstream.branch} fast-forwarded to ${upstreamSha} locally and on ${fork.remote}.`)

  if (alreadyMerged) {
    console.log(`${fork.integrationBranch} already contains ${upstreamRef}; skipping the merge.`)
  } else {
    const merge = git(['merge', '--no-edit', upstreamRef], { allowFailure: true })
    if (merge.status !== 0) {
      const conflicts = git(['diff', '--name-only', '--diff-filter=U']).stdout.trim()
      console.error(`Merge stopped on conflicts:\n${conflicts}\n`)
      console.error(
        [
          'Resolve them so that every feature in config/fork-features.jsonc keeps working, then:',
          '  git add -A && git commit   (commit the merge first: worktree-scope rules read an',
          '                              in-progress merge as one giant edit)',
          `  pnpm sync:upstream${flags.has('--push') ? ' --push' : ''}   (re-run; the merge is skipped and every check runs)`
        ].join('\n')
      )
      return 2
    }
    console.log(`Merged ${upstreamRef} into ${fork.integrationBranch}.`)
  }

  if (!flags.has('--no-checks')) {
    const steps = [
      'pnpm run check:fork-features',
      'pnpm run check:architecture-policies',
      ...forkFeatureCheckSteps(registry).map((step) => step.command)
    ]
    for (const step of steps) {
      if (shell(step) !== 0) {
        console.error(
          `\n${step} failed after the upstream merge. Fix it on ${fork.integrationBranch} before pushing.`
        )
        return 1
      }
    }
  }

  if (flags.has('--push')) {
    git(['push', fork.remote, fork.integrationBranch])
    console.log(`Pushed ${fork.integrationBranch} to ${fork.remote}.`)
  } else {
    console.log(
      `Not pushed. Run with --push, or: git push ${fork.remote} ${fork.integrationBranch}`
    )
  }
  return 0
}

process.exitCode = main()
