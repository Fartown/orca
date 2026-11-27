import { describe, expect, it, vi } from 'vitest'
import {
  fetchIntegrationRelease,
  integrationChanges,
  integrationChangeSummary,
  integrationDownloadUrl,
  parseIntegrationRelease
} from './release-catalog'

const tag = 'integration-123-aaaaaaaaaaaa'
const manifest = {
  schemaVersion: 2,
  tag,
  sha: 'a'.repeat(40),
  desktopVersion: '1.2.3-local.1789228800000.aaaaaaaaaaaa',
  androidVersion: '0.0.48',
  androidVersionCode: 211392000,
  assets: [
    'orca-integration-android.apk',
    'orca-integration-macos-arm64.zip',
    'orca-integration-macos-x64.zip'
  ].map((name) => ({ name, bytes: 1234, sha256: 'b'.repeat(64) }))
}
const release = {
  tag_name: tag,
  draft: false,
  prerelease: true,
  assets: ['build-info.json', 'latest-mac.yml', ...manifest.assets.map((asset) => asset.name)].map(
    (name) => ({ name })
  )
}
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 })
const atom = (...tags: string[]) =>
  new Response(
    `<feed>${tags.map((value) => `<entry><link rel="alternate" href="https://github.com/Fartown/orca/releases/tag/${value}"/></entry>`).join('')}</feed>`
  )

describe('fork integration release catalog', () => {
  const linuxAsset = {
    name: 'orca-linux.AppImage',
    bytes: 1234,
    sha256: 'c'.repeat(64)
  }

  it('keeps the legacy asset list readable while Linux uses its optional field', () => {
    const value = { ...manifest, linuxAssets: [linuxAsset] }
    expect(parseIntegrationRelease(value, tag).assets).toEqual(manifest.assets)
    expect(parseIntegrationRelease(value, tag).linuxAssets).toEqual([linuxAsset])
    expect(parseIntegrationRelease(manifest, tag).linuxAssets).toBeUndefined()
  })

  it('selects a complete Linux build even when a newer release is Mac-only', async () => {
    const newer = { ...release, tag_name: 'integration-124-aaaaaaaaaaaa' }
    const linuxRelease = {
      ...release,
      assets: [...release.assets, { name: 'latest-linux.yml' }, { name: linuxAsset.name }]
    }
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json([newer, linuxRelease]))
      .mockResolvedValueOnce(json({ ...manifest, linuxAssets: [linuxAsset] }))
    expect((await fetchIntegrationRelease('linux', fetcher)).tag).toBe(tag)
    expect(fetcher.mock.calls[1][0]).toBe(integrationDownloadUrl(tag, 'build-info.json'))
  })

  it.each([
    { linuxAssets: [] },
    {
      linuxAssets: [{ name: 'orca-linux.AppImage', bytes: 0, sha256: 'c'.repeat(64) }]
    },
    { linuxAssets: [{ name: 'orca-linux.AppImage', bytes: 123, sha256: 'bad' }] },
    { linuxAssets: [{ name: 'other.AppImage', bytes: 123, sha256: 'c'.repeat(64) }] }
  ])('rejects malformed optional Linux assets: %j', ({ linuxAssets }) => {
    expect(() => parseIntegrationRelease({ ...manifest, linuxAssets }, tag)).toThrow()
  })

  it.each([403, 429])('recovers from API HTTP %i using the public fork feed', async (status) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('API rate limit exceeded', { status }))
      .mockResolvedValueOnce(atom(tag))
      .mockResolvedValueOnce(json(manifest))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
    expect(await fetchIntegrationRelease('android', fetcher)).toMatchObject(manifest)
    expect(fetcher.mock.calls[1][0]).toBe('https://github.com/Fartown/orca/releases.atom')
    expect(fetcher.mock.calls[3]).toMatchObject([
      integrationDownloadUrl(tag, 'orca-integration-android.apk'),
      { method: 'HEAD' }
    ])
    expect(
      fetcher.mock.calls.filter(([url]) => String(url).includes('api.github.com'))
    ).toHaveLength(1)
  })

  it('verifies the Apple Silicon ZIP and updater YAML before accepting the public Mac release', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 403 }))
      .mockResolvedValueOnce(atom(tag))
      .mockResolvedValueOnce(json(manifest))
      .mockImplementation(async () => new Response(null, { status: 200 }))
    expect(await fetchIntegrationRelease('mac', fetcher)).toMatchObject(manifest)
    expect(fetcher.mock.calls.slice(3).map(([url]) => url)).toEqual(
      ['latest-mac.yml', 'orca-integration-macos-arm64.zip'].map((name) =>
        integrationDownloadUrl(tag, name)
      )
    )
    expect(fetcher.mock.calls.slice(3).every(([, init]) => init?.method === 'HEAD')).toBe(true)
  })

  it('sorts and deduplicates public tags, skipping a missing newer APK', async () => {
    const newer = 'integration-124-aaaaaaaaaaaa'
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(atom(tag, newer, newer))
      .mockResolvedValueOnce(json({ ...manifest, tag: newer }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(json(manifest))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
    expect((await fetchIntegrationRelease('android', fetcher)).tag).toBe(tag)
    expect(fetcher.mock.calls[2][0]).toBe(integrationDownloadUrl(newer, 'build-info.json'))
    expect(fetcher).toHaveBeenCalledTimes(6)
  })

  it('bounds missing-public-manifest probes and never reports them as latest', async () => {
    const tags = [123, 124, 125, 126].map((run) => `integration-${run}-aaaaaaaaaaaa`)
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 403 }))
      .mockResolvedValueOnce(atom(...tags))
      .mockImplementation(async () => new Response(null, { status: 404 }))
    await expect(fetchIntegrationRelease('android', fetcher)).rejects.toThrow('No complete')
    expect(fetcher).toHaveBeenCalledTimes(5)
  })

  it.each([
    '<feed><link href="https://github.com/other/orca/releases/tag/integration-999-aaaaaaaaaaaa"/></feed>',
    '<feed><link href="https://github.com/Fartown/orca/releases/tag/v1.2.3"/></feed>',
    '<feed>&lt;link href="https://github.com/Fartown/orca/releases/tag/integration-999-aaaaaaaaaaaa"/&gt;</feed>'
  ])('does not trust unrelated or escaped public-feed content', async (body) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 403 }))
      .mockResolvedValueOnce(new Response(body))
    await expect(fetchIntegrationRelease('android', fetcher)).rejects.toThrow('No complete')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('does not weaken manifest identity validation on the fallback path', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 403 }))
      .mockResolvedValueOnce(atom(tag))
      .mockResolvedValueOnce(json({ ...manifest, sha: 'c'.repeat(40) }))
    await expect(fetchIntegrationRelease('android', fetcher)).rejects.toThrow('Invalid integration')
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('identifies manifest denial separately instead of retrying release discovery', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json([release]))
      .mockResolvedValueOnce(new Response('', { status: 403 }))
    await expect(fetchIntegrationRelease('android', fetcher)).rejects.toThrow(
      'HTTP 403; build-info.json'
    )
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('chooses the newest build run even when GitHub lists an older commit first', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json([{ ...release, tag_name: 'integration-122-aaaaaaaaaaaa' }, release])
      )
      .mockResolvedValueOnce(json(manifest))
    expect((await fetchIntegrationRelease('android', fetcher)).tag).toBe(tag)
  })
  it.each(['android', 'mac'] as const)(
    'selects a complete fork prerelease for %s',
    async (platform) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          json([
            { ...release, draft: true },
            { ...release, tag_name: 'v1.2.3' },
            { ...release, assets: [] },
            release
          ])
        )
        .mockResolvedValueOnce(json(manifest))
      expect(await fetchIntegrationRelease(platform, fetcher)).toMatchObject(manifest)
      expect(fetcher.mock.calls[1][0]).toBe(integrationDownloadUrl(tag, 'build-info.json'))
      expect(fetcher.mock.calls.every(([url]) => String(url).includes('Fartown/orca'))).toBe(true)
    }
  )

  it.each([
    { sha: 'c'.repeat(40) },
    { androidVersionCode: 16 },
    { androidVersionCode: 2.5 },
    { assets: [{ ...manifest.assets[0], sha256: 'bad' }] },
    { assets: [{ ...manifest.assets[0], name: '../other.apk' }] },
    { assets: [manifest.assets[0], manifest.assets[0]] },
    { desktopVersion: 'v1.2.3' },
    { desktopVersion: '1.2.3-local.1789228800000.cccccccccccc' },
    { desktopVersion: '1.2.3-preview.0' },
    { desktopVersion: '1.2.3-preview.01' },
    { desktopVersion: '1.2.3-preview.4.aaaaaaaaaaaa' }
  ])('rejects malformed or mismatched build identity %j', (change) => {
    expect(() => parseIntegrationRelease({ ...manifest, ...change }, tag)).toThrow()
  })

  it('accepts numbered preview versions alongside commit-stamped local versions', () => {
    expect(
      parseIntegrationRelease({ ...manifest, desktopVersion: '1.4.197-preview.12' }, tag)
        .desktopVersion
    ).toBe('1.4.197-preview.12')
    expect(parseIntegrationRelease(manifest, tag).desktopVersion).toBe(manifest.desktopVersion)
  })

  it('reads merged changes but never lets a malformed list block the update', () => {
    const changes = [{ number: 31, title: ' feat: list merged pull requests ' }, { title: 'sync' }]
    expect(integrationChanges(parseIntegrationRelease({ ...manifest, changes }, tag))).toEqual([
      { number: 31, title: 'feat: list merged pull requests' },
      { title: 'sync' }
    ])
    expect(integrationChanges(parseIntegrationRelease(manifest, tag))).toEqual([])
    for (const malformed of [
      'feat: one',
      [{ number: 0, title: 'zero' }],
      [{ number: 31 }],
      [{ title: '  ' }],
      [{ title: 'x'.repeat(301) }],
      Array.from({ length: 101 }, () => ({ title: 'many' }))
    ]) {
      const release = parseIntegrationRelease({ ...manifest, changes: malformed }, tag)
      expect(integrationChanges(release)).toEqual([])
    }
  })

  it('does not mask a rate limit or missing release as up-to-date', async () => {
    await expect(
      fetchIntegrationRelease(
        'android',
        vi.fn().mockResolvedValue(new Response('', { status: 403 }))
      )
    ).rejects.toThrow('403')
    await expect(
      fetchIntegrationRelease('mac', vi.fn().mockResolvedValue(json([])))
    ).rejects.toThrow('No complete')
  })

  it('does not accept arbitrary download origins or traversal', () => {
    expect(() => integrationDownloadUrl('https://elsewhere', 'app.apk')).toThrow()
    expect(() => integrationDownloadUrl(tag, '../app.apk')).toThrow()
  })

  it('aggregates intermediate user-facing changes across skipped preview builds and stops at the installed version', async () => {
    const tag102 = 'integration-102-cccccccccccc'
    const tag101 = 'integration-101-bbbbbbbbbbbb'
    const tag100 = 'integration-100-aaaaaaaaaaaa'
    const buildRelease = (runTag: string, name: string, body = '') => ({
      ...release,
      tag_name: runTag,
      name,
      body
    })
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json([
          buildRelease(
            tag102,
            'Orca 1.4.214-preview.102',
            '<details>\n<summary>工程改动 1 项（测试、文档、CI、重构等）</summary>\n\n- docs(goals): record merge\n\n</details>'
          ),
          buildRelease(tag101, 'Orca 1.4.214-preview.101'),
          buildRelease(tag100, 'Orca 1.4.214-preview.100')
        ])
      )
      .mockResolvedValueOnce(
        json({
          ...manifest,
          tag: tag102,
          sha: 'c'.repeat(40),
          desktopVersion: '1.4.214-preview.102',
          changes: []
        })
      )
      .mockResolvedValueOnce(
        json({
          ...manifest,
          tag: tag101,
          sha: 'b'.repeat(40),
          desktopVersion: '1.4.214-preview.101',
          changes: [{ title: '新功能：Goal 守卫与确认框接管 (#152)' }]
        })
      )

    const resolved = await fetchIntegrationRelease('mac', fetcher, {
      installedDesktopVersion: '1.4.214-preview.100'
    })
    expect(resolved.desktopVersion).toBe('1.4.214-preview.102')
    expect(integrationChangeSummary(resolved)).toBe('新功能：Goal 守卫与确认框接管 (#152)')
    expect(
      fetcher.mock.calls.some(([url]) => String(url).includes(`${tag100}/build-info.json`))
    ).toBe(false)
  })

  it('falls back to engineering changes from manifest, markdown notes, or atom feed when a span has no user-facing changes', async () => {
    const tag102 = 'integration-102-cccccccccccc'
    const tag101 = 'integration-101-bbbbbbbbbbbb'
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json([
          {
            ...release,
            tag_name: tag102,
            name: 'Orca 1.4.214-preview.102',
            body: '<details>\n<summary>工程改动 1 项（测试、文档、CI、重构等）</summary>\n\n- docs(goals): 记录 PR #152 合入结果\n\n</details>'
          },
          { ...release, tag_name: tag101, name: 'Orca 1.4.214-preview.101' }
        ])
      )
      .mockResolvedValueOnce(
        json({
          ...manifest,
          tag: tag102,
          sha: 'c'.repeat(40),
          desktopVersion: '1.4.214-preview.102',
          changes: []
        })
      )

    const fromMarkdown = await fetchIntegrationRelease('mac', fetcher, {
      installedDesktopVersion: '1.4.214-preview.101'
    })
    expect(integrationChangeSummary(fromMarkdown)).toBe('docs(goals): 记录 PR #152 合入结果')
    expect(fetcher).toHaveBeenCalledTimes(2)

    const atomBody = new Response(
      `<feed><entry><link rel="alternate" href="https://github.com/Fartown/orca/releases/tag/${tag102}"/><title>Orca 1.4.214-preview.102</title><content type="html">&lt;details&gt;&lt;summary&gt;工程改动 1 项&lt;/summary&gt;&lt;ul&gt;&lt;li&gt;docs(goals): 记录 PR &lt;a href=&quot;https://github.com/Fartown/orca/pull/152&quot;&gt;#152&lt;/a&gt; 合入结果&lt;/li&gt;&lt;/ul&gt;&lt;/details&gt;</content></entry></feed>`
    )
    const atomFetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(atomBody)
      .mockResolvedValueOnce(
        json({
          ...manifest,
          tag: tag102,
          sha: 'c'.repeat(40),
          desktopVersion: '1.4.214-preview.102',
          androidVersionCode: 211392010,
          changes: []
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
    const fromAtom = await fetchIntegrationRelease('android', atomFetcher, {
      installedAndroidVersionCode: 211392009
    })
    expect(integrationChangeSummary(fromAtom)).toBe('docs(goals): 记录 PR #152 合入结果')
  })

  it('aggregates Android changes across newer versionCodes and stops at the installed APK', async () => {
    const tag103 = 'integration-103-dddddddddddd'
    const tag102 = 'integration-102-cccccccccccc'
    const tag101 = 'integration-101-bbbbbbbbbbbb'
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json([
          { ...release, tag_name: tag103 },
          { ...release, tag_name: tag102 },
          { ...release, tag_name: tag101 }
        ])
      )
      .mockResolvedValueOnce(
        json({
          ...manifest,
          tag: tag103,
          sha: 'd'.repeat(40),
          desktopVersion: '1.4.214-preview.103',
          androidVersionCode: 211392003,
          changes: [{ number: 160, title: 'fix(session-names): 统一会话命名' }]
        })
      )
      .mockResolvedValueOnce(
        json({
          ...manifest,
          tag: tag102,
          sha: 'c'.repeat(40),
          desktopVersion: '1.4.214-preview.102',
          androidVersionCode: 211392002,
          changes: [],
          engineeringChanges: [{ title: 'docs(goals): update journal' }]
        })
      )
      .mockResolvedValueOnce(
        json({
          ...manifest,
          tag: tag101,
          sha: 'b'.repeat(40),
          desktopVersion: '1.4.214-preview.101',
          androidVersionCode: 211392001,
          changes: [{ title: '新功能：Goal 模式 (#152)' }]
        })
      )

    const resolved = await fetchIntegrationRelease('android', fetcher, {
      installedAndroidVersionCode: 211392001
    })
    expect(integrationChangeSummary(resolved)).toBe('fix(session-names): 统一会话命名')
  })
})
