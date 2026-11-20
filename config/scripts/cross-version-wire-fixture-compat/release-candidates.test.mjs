import { describe, expect, it } from 'vitest'
import { resolveReleaseRef } from '../daemon-protocol/admission/check-daemon-protocol-crossing.mjs'
import { recentStableReleaseCandidates, stableReleaseCandidates } from './release-candidates.mjs'

const datedTags = [
  'v1.4.245 100',
  'v1.4.246 101',
  'v1.4.256 102',
  'v1.4.250-rc.1 100',
  'mobile-v1.4.251 100',
  'v1.4.244 99'
].join('\n')

function gitSource({ fork = true, snapshot = '101', mergeBase = 'base', tags = datedTags } = {}) {
  return (_repoRoot, args) => {
    const command = args.join(' ')
    if (command === 'remote') {
      return fork ? 'origin\nfork' : 'origin'
    }
    if (command === 'config --get remote.origin.url') {
      return 'https://github.com/stablyai/orca.git'
    }
    if (command === 'config --get remote.fork.url') {
      return 'git@github.com:Fartown/orca.git'
    }
    if (command === 'merge-base HEAD origin/main') {
      if (!mergeBase) {
        throw new Error('origin/main not found')
      }
      return mergeBase
    }
    if (command === `log -1 --format=%ct ${mergeBase}`) {
      return snapshot
    }
    if (command === 'for-each-ref --format=%(refname:short) %(creatordate:unix) refs/tags/v*') {
      return tags
    }
    if (command === 'tag --list v[0-9]*') {
      return 'v1.4.245\nv1.4.246\nv1.4.256\nv1.4.250-rc.1'
    }
    throw new Error(`unexpected git command: ${command}`)
  }
}

describe('release candidates at the fork sync snapshot', () => {
  it('keeps older nonancestor tags and the equality boundary, excluding later and prerelease tags', () => {
    const runGit = gitSource()
    expect(stableReleaseCandidates('/fixture', runGit)).toEqual([
      'v1.4.246',
      'v1.4.245',
      'v1.4.244'
    ])
    expect(recentStableReleaseCandidates('/fixture', 2, runGit)).toEqual(['v1.4.246', 'v1.4.245'])
  })

  it('keeps upstream selection global', () => {
    expect(stableReleaseCandidates('/fixture', gitSource({ fork: false }))).toEqual([
      'v1.4.256',
      'v1.4.246',
      'v1.4.245'
    ])
  })

  it('fails clearly when the fork snapshot is unavailable or recent candidates are insufficient', () => {
    expect(() => stableReleaseCandidates('/fixture', gitSource({ mergeBase: '' }))).toThrow(
      /origin\/main and a merge-base/
    )
    expect(() => recentStableReleaseCandidates('/fixture', 4, gitSource())).toThrow(
      /found 3 of 4 stable desktop release tags/
    )
  })

  it('preserves an explicit newer daemon release even without a snapshot', () => {
    expect(resolveReleaseRef('/fixture', 'v1.4.256', {})).toBe('v1.4.256')
    expect(
      resolveReleaseRef('/fixture', undefined, { ORCA_CROSS_VERSION_BASELINE_REF: 'v1.4.256' })
    ).toBe('v1.4.256')
  })
})
