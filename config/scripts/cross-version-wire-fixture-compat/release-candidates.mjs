import { execFileSync } from 'node:child_process'
import {
  compareReleaseTags,
  STABLE_DESKTOP_RELEASE_TAG
} from '../release/versioning/stable-release-tags.mjs'

function git(repoRoot, args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim()
}

function configuredForkRemote(repoRoot, runGit) {
  for (const remote of runGit(repoRoot, ['remote']).split('\n').filter(Boolean)) {
    let url
    try {
      url = runGit(repoRoot, ['config', '--get', `remote.${remote}.url`])
    } catch {
      continue
    }
    if (/(?:github\.com[/:])Fartown\/orca(?:\.git)?\/?$/i.test(url)) {
      return true
    }
  }
  return false
}

function stableNewestFirst(tags) {
  return tags
    .filter((tag) => STABLE_DESKTOP_RELEASE_TAG.test(tag))
    .sort((a, b) => compareReleaseTags(b, a))
}

export function stableReleaseCandidates(repoRoot, runGit = git) {
  if (!configuredForkRemote(repoRoot, runGit)) {
    return stableNewestFirst(
      runGit(repoRoot, ['tag', '--list', 'v[0-9]*']).split('\n').filter(Boolean)
    )
  }

  let mergeBase
  try {
    mergeBase = runGit(repoRoot, ['merge-base', 'HEAD', 'origin/main'])
  } catch (error) {
    throw new Error(
      `fork release snapshot requires origin/main and a merge-base with HEAD: ${String(error)}`
    )
  }
  if (!mergeBase) {
    throw new Error('fork release snapshot requires origin/main and a merge-base with HEAD')
  }
  const timestamp = Number(runGit(repoRoot, ['log', '-1', '--format=%ct', mergeBase]))
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new Error(`fork release snapshot has an invalid commit timestamp at ${mergeBase}`)
  }
  return stableNewestFirst(
    runGit(repoRoot, [
      'for-each-ref',
      '--format=%(refname:short) %(creatordate:unix)',
      'refs/tags/v*'
    ])
      .split('\n')
      .filter(Boolean)
      .flatMap((line) => {
        const match = /^(\S+) (\d+)$/.exec(line)
        return match && Number(match[2]) <= timestamp ? [match[1]] : []
      })
  )
}

export function recentStableReleaseCandidates(repoRoot, count, runGit = git) {
  const candidates = stableReleaseCandidates(repoRoot, runGit)
  if (candidates.length < count) {
    throw new Error(
      `Cross-version harness found ${candidates.length} of ${count} stable desktop release tags; ` +
        'a shallow CI clone needs `fetch-depth: 0`.'
    )
  }
  return candidates.slice(0, count)
}
