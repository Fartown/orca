import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createForkFeed, routeForkRequests } from './probe-feed.mjs'
import { completedProfile } from './probe-package.mjs'
import { assertHostedMac } from '../signing-probe/probe-policy.mjs'

const directories = []
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('real Orca update acceptance contract', () => {
  it('refuses actual execution on a developer Mac', () => {
    expect(() => assertHostedMac({}, 'darwin')).toThrow()
    expect(() =>
      assertHostedMac(
        { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'self-hosted', RUNNER_TEMP: '/tmp' },
        'darwin'
      )
    ).toThrow()
  })

  it('reuses the current repository completed-onboarding profile', async () => {
    const profile = await completedProfile()
    expect(profile.onboarding.closedAt).toBeGreaterThan(0)
    expect(profile.ui.contextualToursAutoEligible).toBe(false)
  })

  it('serves fork catalog, immutable manifest, exact YAML checksum and real ZIP bytes', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'orca-feed-contract-'))
    directories.push(directory)
    const zip = join(directory, 'fixture.zip')
    const bytes = Buffer.from('transport fixture; not an installable package')
    writeFileSync(zip, bytes)
    const sha = '123456789abc'.padEnd(40, '0')
    const tag = 'integration-12345-123456789abc'
    const feed = await createForkFeed({
      zip,
      sha,
      tag,
      version: '1.4.197-local.123.123456789abc',
      output: join(directory, 'requests.json')
    })
    try {
      const catalog = await (await fetch(`${feed.url}/catalog`)).json()
      expect(catalog[0].tag_name).toBe(tag)
      expect(catalog[0].assets.map((asset) => asset.name)).toContain('latest-mac.yml')
      const manifest = await (await fetch(`${feed.url}/build-info.json`)).json()
      expect(manifest.sha).toBe(sha)
      expect(manifest.assets[0].bytes).toBe(bytes.length)
      expect(await (await fetch(`${feed.url}/latest-mac.yml`)).text()).toContain(
        `size: ${bytes.length}`
      )
      expect(
        Buffer.from(
          await (
            await fetch(`${feed.url}/orca-integration-macos-${process.arch}.zip`)
          ).arrayBuffer()
        )
      ).toEqual(bytes)
      expect((await fetch(`${feed.url}/unknown`)).status).toBe(404)
    } finally {
      await feed.close()
    }
    expect(JSON.parse(readFileSync(join(directory, 'requests.json'), 'utf8'))).toHaveLength(5)
  })

  it('redirects only fork requests in both real Electron updater network sessions', async () => {
    const registrations = []
    const target = { webRequest: { onBeforeRequest: (...args) => registrations.push(args) } }
    await routeForkRequests(
      {
        evaluate: async (callback, args) =>
          callback({ session: { defaultSession: target, fromPartition: () => target } }, args)
      },
      'http://127.0.0.1:1234',
      'integration-1-123456789abc'
    )
    expect(registrations).toHaveLength(2)
    expect(registrations[0][0].urls).toEqual([
      'https://api.github.com/repos/Fartown/orca/releases*',
      'https://github.com/Fartown/orca/releases/download/integration-1-123456789abc/*'
    ])
    let redirect
    registrations[0][1](
      { url: 'https://api.github.com/repos/Fartown/orca/releases?per_page=30' },
      (value) => {
        redirect = value
      }
    )
    expect(redirect).toEqual({ redirectURL: 'http://127.0.0.1:1234/catalog?per_page=30' })
    delete globalThis.__orcaProbeRequests
  })

  it('preserves normal packaging hooks and does not invoke localBuild or replace the native installer', () => {
    const build = readFileSync(new URL('./probe-package.mjs', import.meta.url), 'utf8')
    const run = readFileSync(new URL('./run-probe.mjs', import.meta.url), 'utf8')
    expect(build.match(/runBuild\(\['run', 'build:release'\]/g)).toHaveLength(1)
    expect(build).toContain('config/scripts/integration-builds/electron-builder.cjs')
    expect(build).not.toContain('afterPack:')
    expect(build).not.toContain('afterSign:')
    expect(run).toContain('window.api.updater.check()')
    expect(run).toContain('window.api.updater.quitAndInstall()')
    expect(run).not.toContain('localBuild: true')
    expect(run.indexOf('identity.cleanup()')).toBeLessThan(run.indexOf('await launchOrca('))
  })
})
