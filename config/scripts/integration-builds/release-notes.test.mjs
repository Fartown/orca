import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  prSummarySections,
  readAiSummary,
  summaryPrompt,
  upstreamShortVersion,
  writeAiSummary
} from './ai-release-summary.mjs'
import {
  classifyCommit,
  loadFeatureGroups,
  manifestChanges,
  readFirstParentCommits,
  renderChangeSections,
  syncHeadline
} from './release-notes.mjs'
import { listOfficialReleases, summarizeUpstreamSync } from './upstream-summary.mjs'

const features = new Map([
  ['goals', 'Goal 目标模式'],
  ['issues-board', 'Issues 看板与会话']
])
const commit = (message, parents = ['p'.repeat(40)], sha = 'c'.repeat(40)) =>
  classifyCommit({ sha, parents, message })
const sync = commit("Merge remote-tracking branch 'origin/main' into fork/integration\n", [
  'b'.repeat(40),
  'u'.repeat(40)
])
const summary = {
  commitCount: 12,
  compareUrl: 'https://github.com/stablyai/orca/compare/x...y',
  releases: [
    { tag: 'v1.4.220', url: 'https://example.test/v1.4.220', body: '' },
    { tag: 'v1.4.221', url: 'https://example.test/v1.4.221', body: '' }
  ],
  highlights: [{ scope: 'browser', titles: ['add an eraser'], more: 2 }]
}

afterEach(() => vi.restoreAllMocks())

describe('what each first-parent commit is', () => {
  it('reads hashes, parents and full messages from git log', () => {
    const git = vi.fn(
      () => `${'a'.repeat(40)}\x1f${'b'.repeat(40)}\x1ffeat(goals): one\n\nbody\n\0\n`
    )
    expect(readFirstParentCommits(git, 'x..y')).toEqual([
      { sha: 'a'.repeat(40), parents: ['b'.repeat(40)], message: 'feat(goals): one\n\nbody\n' }
    ])
    expect(git.mock.calls[0][0]).toEqual([
      'log',
      '--first-parent',
      '--max-count=500',
      '--format=%H%x1f%P%x1f%B%x00',
      'x..y',
      '--'
    ])
  })

  it('tells pull requests, upstream syncs, other merges and engineering commits apart', () => {
    const pr = commit('Merge pull request #45 from Fartown/fix/x\n\nfix(goals): keep the goal\n', [
      'a'.repeat(40),
      'b'.repeat(40)
    ])
    expect(pr).toMatchObject({ kind: 'pr', number: 45, type: 'fix', userFacing: true })
    expect(sync).toMatchObject({
      kind: 'sync',
      baseSha: 'b'.repeat(40),
      upstreamSha: 'u'.repeat(40)
    })
    expect(commit("Merge branch 'fork/integration' into x", ['a', 'b'])).toMatchObject({
      kind: 'merge',
      userFacing: false
    })
    expect(commit('test(goals): cover it')).toMatchObject({ type: 'test', userFacing: false })
    // A mislabelled change is shown rather than folded away.
    expect(commit('Fix the thing')).toMatchObject({ type: null, userFacing: true })
  })
})

describe('release note sections', () => {
  it('groups user-facing changes by feature and folds engineering work', () => {
    const changes = [
      commit('feat(goals): pause a goal'),
      commit('fix(issues): keep the launch agent'),
      commit('perf: faster start'),
      commit('docs(goals): record the sync'),
      sync
    ]
    const [visible, upstream, engineering] = renderChangeSections({
      changes,
      features,
      syncSummaries: [summary]
    })
    expect(visible).toBe(
      [
        '## 这一版变了什么',
        '',
        '### Goal 目标模式',
        '',
        '- 新功能：pause a goal',
        '',
        '### Issues 看板与会话',
        '',
        '- 修复：keep the launch agent',
        '',
        '### 其他',
        '',
        '- 性能：faster start'
      ].join('\n')
    )
    expect(upstream).toContain('同步上游（期间官方发布 v1.4.220 至 v1.4.221，12 个提交）')
    expect(upstream).toContain('[v1.4.221](https://example.test/v1.4.221)')
    expect(upstream).toContain('<summary>上游新功能提交摘录</summary>')
    expect(upstream).toContain('- **browser**：add an eraser 等 3 项')
    expect(engineering).toContain('<summary>工程改动 1 项（测试、文档、CI、重构等）</summary>')
  })

  it('says so when a build has nothing a user would notice', () => {
    expect(renderChangeSections({ changes: [commit('ci: retry')], features })[0]).toContain(
      '本次只有工程改动'
    )
    expect(
      renderChangeSections({ changes: [sync], features, syncSummaries: [summary] })[0]
    ).toContain('见下方同步上游')
  })

  it('names syncs by official releases, never by main’s lagging package version', () => {
    expect(syncHeadline({ ...summary, releases: summary.releases.slice(0, 1) })).toBe(
      '同步上游（期间官方发布 v1.4.220，12 个提交）'
    )
    expect(syncHeadline({ ...summary, releases: [] })).toBe('同步上游（12 个提交）')
    expect(syncHeadline({ ...summary, releases: [], commitCount: null })).toBe('同步上游')
  })

  it('keeps the update prompt list within what installed clients accept', () => {
    const many = Array.from({ length: 120 }, (_, index) =>
      commit(`fix(goals): change ${index} ${'x'.repeat(index === 0 ? 400 : 0)}`)
    )
    const pr = commit('Merge pull request #7 from a/b\n\nfeat(goals): seven\n', ['a', 'b'])
    const entries = manifestChanges([pr, commit('test: skip'), sync, ...many], [summary])
    expect(entries).toHaveLength(100)
    expect(entries[0]).toEqual({ title: syncHeadline(summary) })
    expect(entries[1]).toEqual({ number: 7, title: 'feat(goals): seven' })
    expect(entries[2].title).toHaveLength(300)
    expect(entries.every((entry) => entry.title.length <= 300)).toBe(true)
  })

  it('reads feature groups from the registry', () => {
    const groups = loadFeatureGroups()
    expect(groups.get('integration-builds')).toBe('集成分支自动出包')
    expect([...groups.values()].every((name) => !name.includes('：'))).toBe(true)
  })
})

describe('upstream sync summary', () => {
  const git = vi.fn((args) => {
    const [command] = args
    if (command === 'merge-base') {
      return 'f'.repeat(40)
    }
    if (command === 'show') {
      return args.at(-1) === 'f'.repeat(40) ? '2026-10-01T00:00:00Z' : '2026-10-05T00:00:00Z'
    }
    if (command === 'rev-list') {
      return '42\n'
    }
    return 'feat(browser): add an eraser (#9)\nfix(ssh): reconnect\nfeat: plain\n'
  })

  it('lists official releases published between the two sync points', () => {
    const release = (tag, publishedAt) => ({
      tag_name: tag,
      html_url: `https://example.test/${tag}`,
      body: tag,
      published_at: publishedAt
    })
    const result = summarizeUpstreamSync({
      git,
      sync: { baseSha: 'b'.repeat(40), upstreamSha: 'u'.repeat(40) },
      officialReleases: [
        release('v1.4.221', '2026-10-04T00:00:00Z'),
        release('v1.4.220', '2026-10-02T00:00:00Z'),
        release('v1.4.219', '2026-09-30T00:00:00Z'),
        release('v1.4.222', '2026-10-06T00:00:00Z')
      ]
    })
    expect(result.releases.map((item) => item.tag)).toEqual(['v1.4.220', 'v1.4.221'])
    expect(result.commitCount).toBe(42)
    expect(result.compareUrl).toBe(
      `https://github.com/stablyai/orca/compare/${'f'.repeat(40)}...${'u'.repeat(40)}`
    )
    expect(result.highlights).toEqual([
      { scope: 'browser', titles: ['add an eraser'], more: 0 },
      { scope: '通用', titles: ['plain'], more: 0 }
    ])
  })

  it('keeps only published desktop releases and survives GitHub being unreadable', () => {
    const gh = vi.fn(() =>
      JSON.stringify([
        { tag_name: 'v1.4.221', draft: false, prerelease: false },
        { tag_name: 'v1.4.222-rc.1', draft: false, prerelease: true },
        { tag_name: 'mobile-v0.0.9', draft: false, prerelease: false }
      ])
    )
    expect(listOfficialReleases(gh).map((release) => release.tag_name)).toEqual(['v1.4.221'])
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(
      listOfficialReleases(() => {
        throw new Error('HTTP 403')
      })
    ).toEqual([])
  })
})

describe('AI short version', () => {
  const reply = (stopReason, text) => ({
    beta: {
      messages: {
        stream: vi.fn(() => ({
          finalMessage: async () => ({
            stop_reason: stopReason,
            content: [{ type: 'text', text }]
          })
        }))
      }
    }
  })

  it('feeds Claude the plain-language parts of PRs and upstream’s own short version', () => {
    expect(
      prSummarySections(
        '## ELI5\n<!-- hint -->\nKids get it.\n\n## Why\nnot this\n\n## What Changed\nThe list.\n'
      )
    ).toBe('ELI5: Kids get it.\nWhat Changed: The list.')
    expect(
      upstreamShortVersion('intro\n\n## The short version\n\n- **A:** one\n\n## Known issues\nno')
    ).toBe('- **A:** one')
    const prompt = summaryPrompt({
      changes: [commit('Merge pull request #3 from a/b\n\nfeat(goals): three\n', ['a', 'b'])],
      features,
      prBodies: new Map([[3, '## ELI5\nGoals pause.\n']]),
      syncSummaries: [
        { ...summary, releases: [{ tag: 'v1.4.221', body: '## The short version\n- up\n---' }] }
      ]
    })
    expect(prompt).toContain('- 新功能：three (#3)\n  ELI5: Goals pause.')
    expect(prompt).toContain('官方 v1.4.221 的短版本：\n- up')
  })

  it('asks Opus with server-side refusal fallback and keeps only a bullet list', async () => {
    const client = reply('end_turn', '- **目标**：可以暂停\n- 修好了续接\n')
    await expect(
      writeAiSummary({ apiKey: 'key', prompt: 'p', createClient: () => client })
    ).resolves.toBe('- **目标**：可以暂停\n- 修好了续接')
    expect(client.beta.messages.stream.mock.calls[0][0]).toMatchObject({
      model: 'claude-opus-5-5',
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      messages: [{ role: 'user', content: 'p' }]
    })
    expect(client.beta.messages.stream.mock.calls[0][0]).not.toHaveProperty('thinking')
  })

  it.each([
    ['no key is configured', { apiKey: '' }],
    ['the whole chain refused', { createClient: () => reply('refusal', '') }],
    ['the reply is not a list', { createClient: () => reply('end_turn', '好的，以下是：\n- 一') }],
    [
      'the API fails',
      {
        createClient: () => ({
          beta: {
            messages: {
              stream: () => {
                throw Object.assign(new Error('overloaded'), { status: 529 })
              }
            }
          }
        })
      }
    ]
  ])('leaves the short version out when %s', async (_, options) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await expect(writeAiSummary({ apiKey: 'key', prompt: 'p', ...options })).resolves.toBeNull()
  })

  it('finds the SDK the root install hoists, so no upstream manifest has to change', async () => {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    expect(new Anthropic({ apiKey: 'test' }).beta.messages.stream).toBeTypeOf('function')
  })

  it('reads nothing when the summary job left no file', () => {
    expect(readAiSummary(undefined)).toBeNull()
    expect(readAiSummary('/nonexistent-orca-summary')).toBeNull()
  })
})
