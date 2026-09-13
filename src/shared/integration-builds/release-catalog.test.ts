import { describe, expect, it, vi } from 'vitest'
import {
  fetchIntegrationRelease,
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

  it('verifies both ZIPs and the updater YAML before accepting the public Mac release', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 403 }))
      .mockResolvedValueOnce(atom(tag))
      .mockResolvedValueOnce(json(manifest))
      .mockImplementation(async () => new Response(null, { status: 200 }))
    expect(await fetchIntegrationRelease('mac', fetcher)).toMatchObject(manifest)
    expect(fetcher.mock.calls.slice(3).map(([url]) => url)).toEqual(
      ['latest-mac.yml', 'orca-integration-macos-arm64.zip', 'orca-integration-macos-x64.zip'].map(
        (name) => integrationDownloadUrl(tag, name)
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
    { desktopVersion: 'v1.2.3' }
  ])('rejects malformed or mismatched build identity %j', (change) => {
    expect(() => parseIntegrationRelease({ ...manifest, ...change }, tag)).toThrow()
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
})
