import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AI_SUMMARY_FILE, writeMilestoneSummary } from './ai-release-summary.mjs'
import androidConfig from './android-config.cjs'
import { integrationTag } from './build-identity.mjs'
import { latestPreviewNumber, listIntegrationReleases } from './integration-releases.mjs'
import { signingCertificate } from './mac-signing.cjs'
import {
  AI_SUMMARY_LABEL,
  milestonesOf,
  milestoneUpstreamVersion,
  nextMilestone,
  planMilestone
} from './milestone-release.mjs'
import { pruneBuildReleases, selectPrunableBuilds } from './prune-releases.mjs'
import { PACKAGE_NAMES, publishRelease } from './publish-release.mjs'
import { listMergedChanges, releaseContext } from './release-context.mjs'
import { classifyCommit } from './release-notes.mjs'

const sha = 'a'.repeat(40)
const previousSha = 'b'.repeat(40)
const upstreamSha = 'e'.repeat(40)
const milestoneSha = 'd'.repeat(40)
const build = (run, target = previousSha, extra = {}) => ({
  tag_name: `integration-${run}-${target.slice(0, 12)}`,
  name: `Orca 1.2.3-preview.${run - 100}`,
  target_commitish: target,
  draft: false,
  prerelease: true,
  run,
  ...extra
})
const milestone = (tag, target, extra = {}) => ({
  tag_name: tag,
  name: tag,
  html_url: `https://github.com/Fartown/orca/releases/tag/${tag}`,
  target_commitish: target,
  published_at: '2026-10-01T00:00:00Z',
  draft: false,
  prerelease: false,
  ...extra
})
const entry = (commitSha, parents, message) =>
  `${commitSha}\x1f${parents.join(' ')}\x1f${message}\0`
const prMerge = entry(
  'c'.repeat(40),
  [previousSha, 'f'.repeat(40)],
  'Merge pull request #46 from Fartown/feat/x\n\nfeat(goals): pause a goal\n'
)
const syncMerge = entry(
  sha,
  ['c'.repeat(40), upstreamSha],
  "Merge remote-tracking branch 'origin/main' into fork/integration\n"
)
const directories = []

/** A repository whose first-parent history since the previous build is a PR and a sync. */
function repository({ ancestors = [previousSha], olderHistory = '' } = {}) {
  return vi.fn((args) => {
    const [command] = args
    if (command === 'merge-base') {
      if (args[1] !== '--is-ancestor') {
        return '9'.repeat(40)
      }
      if (!ancestors.includes(args[2])) {
        throw new Error('not an ancestor')
      }
      return ''
    }
    if (command === 'show') {
      return args.at(-1) === upstreamSha ? '2026-10-05T00:00:00Z' : '2026-10-01T00:00:00Z'
    }
    if (command === 'rev-list') {
      return '7\n'
    }
    if (args.includes('--first-parent')) {
      const range = args.at(-2)
      return range.includes('..')
        ? `${syncMerge}\n${prMerge}\n`
        : `${syncMerge}\n${prMerge}\n${olderHistory}`
    }
    return 'feat(browser): add an eraser\n'
  })
}

function github(releases) {
  const official = [
    {
      tag_name: 'v1.4.221',
      html_url: 'https://github.com/stablyai/orca/releases/tag/v1.4.221',
      body: '## The short version\n- upstream\n',
      published_at: '2026-10-03T00:00:00Z',
      draft: false,
      prerelease: false
    }
  ]
  return vi.fn((args) => {
    if (args[0] === 'api' && args.includes('--slurp')) {
      return JSON.stringify([releases])
    }
    if (args[0] === 'api' && args[1].startsWith('repos/stablyai/orca/releases')) {
      return JSON.stringify(official)
    }
    if (args[0] === 'api' && args[1].includes('/pulls/')) {
      return '## ELI5\nGoals can pause.\n'
    }
    if (args[0] === 'api') {
      throw Object.assign(new Error('Not found'), { stderr: 'gh: Not Found (HTTP 404)' })
    }
    return ''
  })
}

const env = {
  GITHUB_REPOSITORY: 'Fartown/orca',
  GITHUB_REF: 'refs/heads/fork/integration',
  GITHUB_EVENT_NAME: 'push',
  GITHUB_SHA: sha,
  GITHUB_RUN_ID: '200',
  ORCA_INTEGRATION_VERSION_CODE: String(androidConfig.androidVersionCode(1789228800000))
}

function packages(version) {
  const directory = mkdtempSync(join(tmpdir(), 'orca-release-lifecycle-'))
  directories.push(directory)
  PACKAGE_NAMES.forEach((name) => writeFileSync(join(directory, name), name))
  const certificate = signingCertificate()
  writeFileSync(
    join(directory, 'mac-signing-arm64.json'),
    JSON.stringify({
      schemaVersion: 1,
      arch: 'arm64',
      version,
      certificateSha256: certificate.sha256,
      requirement: `identifier "com.stably.orca" and certificate root = H"${certificate.sha1}"`
    })
  )
  return directory
}

afterEach(() => {
  directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }))
  vi.restoreAllMocks()
})

describe('build numbering survives pruning', () => {
  it('continues after the highest published number, not the count', () => {
    expect(latestPreviewNumber([build(137), build(136)])).toBe(37)
    // Builds from before numbering carry no number in their title and still count.
    expect(latestPreviewNumber([build(101, previousSha, { name: 'Orca Integration x' })])).toBe(1)
    expect(latestPreviewNumber([])).toBe(0)
  })

  it('refuses a number another build already owns after older ones were pruned', async () => {
    const version = '1.2.3-preview.3'
    const releases = [build(140), build(139)]
    await expect(
      publishRelease({
        env: { ...env, ORCA_LOCAL_BUILD_VERSION: version },
        directory: packages(version),
        mobile: { expo: { version: '0.0.48' } },
        gh: github(releases),
        git: repository()
      })
    ).rejects.toThrow(/stale: preview\.40/)
  })
})

describe('pruning old build releases', () => {
  const builds = Array.from({ length: 14 }, (_, index) => build(100 + index))

  it('keeps the newest ten and any build a milestone links to', () => {
    const linked = milestone('fork-v1.4.221-1', previousSha, {
      body: `安装包在 [Orca](https://github.com/Fartown/orca/releases/tag/${builds[1].tag_name})`
    })
    expect(
      selectPrunableBuilds({ builds, milestones: [linked] }).map((release) => release.run)
    ).toEqual([103, 102, 100])
  })

  it('reports a failed deletion without failing the publish', () => {
    const warn = vi.spyOn(console, 'log').mockImplementation(() => {})
    const gh = vi.fn((args) => {
      if (args.includes(builds[0].tag_name)) {
        throw new Error('HTTP 500')
      }
      return ''
    })
    expect(pruneBuildReleases({ gh, repo: 'Fartown/orca', builds, milestones: [] })).toHaveLength(3)
    expect(gh.mock.calls[0][0]).toEqual([
      'release',
      'delete',
      builds[3].tag_name,
      '--repo',
      'Fartown/orca',
      '--cleanup-tag',
      '--yes'
    ])
    expect(warn.mock.calls.flat().join('\n')).toContain(
      `::warning::Could not delete ${builds[0].tag_name}`
    )
  })
})

describe('milestone releases', () => {
  const buildChanges = [classifyCommit({ sha: 'c'.repeat(40), parents: ['x'], message: 'fix: y' })]
  const syncChange = classifyCommit({
    sha,
    parents: ['c'.repeat(40), upstreamSha],
    message: "Merge remote-tracking branch 'origin/main'"
  })

  it('numbers milestones per upstream version and names them after the newest official release', () => {
    const milestones = milestonesOf([
      milestone('fork-v1.4.221-1', milestoneSha),
      milestone('fork-v1.4.221-2', milestoneSha, { draft: true }),
      milestone('fork-v1.4.220-4', milestoneSha),
      build(100)
    ])
    expect(milestones.map((item) => item.tag_name)).toEqual(['fork-v1.4.221-1', 'fork-v1.4.220-4'])
    expect(nextMilestone('1.4.221', milestones)).toEqual({
      tag: 'fork-v1.4.221-2',
      title: 'Orca 集成版 1.4.221 · 第 2 版'
    })
    const releases = (...tags) => ({ releases: tags.map((tag) => ({ tag })) })
    expect(
      milestoneUpstreamVersion({
        syncSummaries: [releases('v1.4.210', 'v1.4.221'), releases('v1.4.209')],
        previous: milestones[0],
        packageVersion: '1.4.214'
      })
    ).toBe('1.4.221')
    expect(
      milestoneUpstreamVersion({
        syncSummaries: [],
        previous: milestones[1],
        packageVersion: '1.4.214'
      })
    ).toBe('1.4.220')
    expect(
      milestoneUpstreamVersion({
        syncSummaries: [releases()],
        previous: null,
        packageVersion: '1.4.214'
      })
    ).toBe('1.4.214')
  })

  it('is due on an upstream sync or on request, once per commit', () => {
    const git = repository()
    const plan = (overrides) =>
      planMilestone({ git, sha, buildChanges, milestones: [], requested: false, ...overrides })
    expect(plan({})).toBeNull()
    expect(plan({ buildChanges: [syncChange] })).not.toBeNull()
    expect(plan({ requested: true })).not.toBeNull()
    expect(
      plan({ requested: true, milestones: milestonesOf([milestone('fork-v1.4.221-1', sha)]) })
    ).toBeNull()
  })

  it('covers everything since the previous milestone, or since the newest sync for the first one', () => {
    const older = entry('9'.repeat(40), ['8'.repeat(40)], 'fix(goals): older\n')
    const git = repository({ ancestors: [milestoneSha], olderHistory: `${older}\n` })
    const previous = milestonesOf([
      milestone('fork-v1.4.220-1', milestoneSha),
      milestone('fork-v1.4.219-1', 'f'.repeat(40), { published_at: '2026-10-02T00:00:00Z' })
    ])
    const since = planMilestone({ git, sha, buildChanges, milestones: previous, requested: true })
    expect(since.previous.tag_name).toBe('fork-v1.4.220-1')
    expect(git.mock.calls.find(([args]) => args[0] === 'log')[0]).toContain(
      `${milestoneSha}..${sha}`
    )
    expect(since.changes.map((change) => change.kind)).toEqual(['sync', 'pr'])
    const first = planMilestone({ git, sha, buildChanges, milestones: [], requested: true })
    expect(first.previous).toBeNull()
    // The newest sync is the head commit, and the build's own range is one commit long.
    expect(first.changes.map((change) => change.kind)).toEqual(['sync'])
  })
})

describe('what merged since the previous integration build', () => {
  it('compares only with published integration builds across every page', () => {
    const builds = listIntegrationReleases(
      github([
        build(124, 'c'.repeat(40)),
        build(121, sha),
        build(120, 'd'.repeat(40), { draft: true }),
        { ...build(119), tag_name: 'v1.2.3' },
        build(118, 'd'.repeat(40), { prerelease: false }),
        build(122),
        build(100, 'e'.repeat(40))
      ]),
      'Fartown/orca'
    )
    expect(builds.map((release) => release.run)).toEqual([124, 121, 122, 100])
    const git = repository()
    const merged = listMergedChanges({ builds, git, sha, runId: '123' })
    expect(merged.previous.run).toBe(122)
    expect(git.mock.calls[0][0]).toEqual(['merge-base', '--is-ancestor', previousSha, sha])
    expect(merged.changes.map((change) => change.kind)).toEqual(['sync', 'pr'])
  })

  it.each([
    ['the previous build is not an ancestor', [build(122)], []],
    ['no earlier build was published', [], [previousSha]]
  ])('falls back to the head commit when %s', (_, builds, ancestors) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const git = repository({ ancestors })
    const result = listMergedChanges({ builds, git, sha, runId: '123' })
    expect(result.previous).toBeNull()
    expect(git.mock.calls.at(-1)[0]).toContain('--max-count=1')
    expect(warn).toHaveBeenCalledTimes(builds.length)
  })
})

describe('publishing a build that brings in an upstream sync', () => {
  const version = '1.2.3-preview.25'
  const releases = [
    ...Array.from({ length: 12 }, (_, index) =>
      build(124 - index, index ? 'f'.repeat(40) : previousSha)
    ),
    milestone('fork-v1.4.220-1', 'f'.repeat(40), {
      body: `[x](…/integration-113-${'f'.repeat(12)})`
    })
  ]

  async function publish(summaryDirectory) {
    const directory = packages(version)
    const gh = github(releases)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await publishRelease({
      env: { ...env, ORCA_LOCAL_BUILD_VERSION: version },
      directory,
      mobile: { expo: { version: '0.0.48' } },
      gh,
      git: repository({ ancestors: [previousSha] }),
      summaryDirectory
    })
    return {
      directory,
      gh,
      writes: gh.mock.calls.map(([args]) => args).filter((args) => args[0] === 'release')
    }
  }

  it('writes readable notes, a milestone with the AI short version, and prunes old builds', async () => {
    const summaryDirectory = mkdtempSync(join(tmpdir(), 'orca-release-summary-'))
    directories.push(summaryDirectory)
    writeFileSync(join(summaryDirectory, AI_SUMMARY_FILE), '- **目标**：可以暂停\n')
    const { directory, writes } = await publish(summaryDirectory)
    const notes = readFileSync(join(directory, 'release-notes.md'), 'utf8')
    expect(notes).toMatch(
      /^集成分支内测包（非正式版）。\n\n## 这一版变了什么\n\n### Goal 目标模式\n\n- 新功能：pause a goal \(#46\)/
    )
    expect(notes).toContain('同步上游（期间官方发布 v1.4.221，7 个提交）')
    expect(notes).toContain('<summary>安装、签名与校验</summary>')
    expect(notes).toContain(`相比 [${build(124).tag_name}]`)
    expect(JSON.parse(readFileSync(join(directory, 'build-info.json'), 'utf8')).changes).toEqual([
      { title: '同步上游（期间官方发布 v1.4.221，7 个提交）' },
      { number: 46, title: 'feat(goals): pause a goal' }
    ])
    const tag = integrationTag(sha, '200')
    expect(writes.slice(0, 3).map((args) => args.slice(0, 3))).toEqual([
      ['release', 'create', tag],
      ['release', 'upload', tag],
      ['release', 'edit', tag]
    ])
    const create = writes[3]
    expect(create.slice(0, 3)).toEqual(['release', 'create', 'fork-v1.4.221-1'])
    expect(create).toContain('--latest')
    expect(create).not.toContain('--prerelease')
    expect(create).toContain('Orca 集成版 1.4.221 · 第 1 版')
    const milestoneNotes = readFileSync(join(directory, 'milestone-notes.md'), 'utf8')
    expect(milestoneNotes).toMatch(
      new RegExp(`^## 短版本\\n\\n${AI_SUMMARY_LABEL}\\n\\n- \\*\\*目标\\*\\*：可以暂停`)
    )
    expect(milestoneNotes).toContain(
      `[Orca ${version}](https://github.com/Fartown/orca/releases/tag/${tag})`
    )
    // Ten newest (this one included) stay, plus the build the earlier milestone links to.
    expect(writes.slice(4).map((args) => args[2])).toEqual([
      build(115, 'f'.repeat(40)).tag_name,
      build(114, 'f'.repeat(40)).tag_name
    ])
  })

  it('still publishes the build when the milestone cannot be created', async () => {
    const directory = packages(version)
    const listed = github(releases)
    const gh = vi.fn((args) => {
      if (args[1] === 'create' && args[2].startsWith('fork-v')) {
        throw new Error('HTTP 422')
      }
      return listed(args)
    })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await publishRelease({
      env: { ...env, ORCA_LOCAL_BUILD_VERSION: version },
      directory,
      mobile: { expo: { version: '0.0.48' } },
      gh,
      git: repository({ ancestors: [previousSha] })
    })
    expect(gh.mock.calls.some(([args]) => args[1] === 'edit')).toBe(true)
    expect(log.mock.calls.flat().join('\n')).toContain('::warning::Could not publish the milestone')
    expect(readFileSync(join(directory, 'milestone-notes.md'), 'utf8')).not.toContain('短版本')
  })

  it('writes the AI input only in the read-only summary job, and nothing when no milestone is due', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'orca-release-summary-'))
    directories.push(directory)
    const stream = vi.fn(() => ({
      finalMessage: async () => ({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: '- 一\n- 二' }]
      })
    }))
    const createClient = () => ({ beta: { messages: { stream } } })
    const options = { directory, gh: github(releases), git: repository(), createClient }
    await writeMilestoneSummary({ ...options, env: { ...env, ANTHROPIC_API_KEY: 'key' } })
    expect(readFileSync(join(directory, AI_SUMMARY_FILE), 'utf8')).toBe('- 一\n- 二\n')
    expect(stream.mock.calls[0][0].messages[0].content).toContain('ELI5: Goals can pause.')
    expect(stream.mock.calls[0][0].messages[0].content).toContain(
      '官方 v1.4.221 的短版本：\n- upstream'
    )
    rmSync(join(directory, AI_SUMMARY_FILE))
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const quiet = repository()
    quiet.mockImplementation((args) => (args.includes('--first-parent') ? prMerge : ''))
    await writeMilestoneSummary({
      ...options,
      git: quiet,
      env: { ...env, ANTHROPIC_API_KEY: 'key' }
    })
    expect(stream).toHaveBeenCalledTimes(1)
    expect(() => readFileSync(join(directory, AI_SUMMARY_FILE))).toThrow()
  })

  it('shares one view of the release history between the summary job and the publisher', () => {
    const context = releaseContext({
      gh: github(releases),
      git: repository({ ancestors: [previousSha] }),
      releases,
      sha,
      runId: '200',
      milestoneRequested: false
    })
    expect(context.previous.tag_name).toBe(build(124).tag_name)
    expect(context.plan.previous).toBeNull()
    expect(context.syncSummariesOf(context.buildChanges)).toHaveLength(1)
  })
})
