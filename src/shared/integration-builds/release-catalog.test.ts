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

describe('fork integration release catalog', () => {
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
