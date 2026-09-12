import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createForkFeed, routeForkRequests } from './probe-feed.mjs'
import { completedProfile } from './probe-package.mjs'
import { continuityCommand, hasContinuityOutput, readNativeRuntime } from './probe-runtime.mjs'
import { assertHostedMac } from '../signing-probe/probe-policy.mjs'
import { readyOrca, startupDeadline } from './probe-startup.mjs'
import { nativeStatePaths, observeNativeRelaunch } from './probe-native-relaunch.mjs'
import { selectNativeProcess } from './probe-native-selection.mjs'

const directories = []
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('real Orca update acceptance contract', () => {
  it('rejects surviving same-executable daemons and requires a new metadata-owned main PID', () => {
    const old = [
      { pid: 123, command: 'Orca' },
      { pid: 456, command: 'Orca daemon.js' }
    ]
    const before = old.map(({ pid }) => pid)
    expect(selectNativeProcess(old, before, { pid: 456 })).toBeNull()
    const inventory = [
      ...old,
      { pid: 789, command: 'Orca' },
      { pid: 790, command: 'Orca daemon.js' }
    ]
    expect(selectNativeProcess(inventory, before, {})).toBeNull()
    expect(selectNativeProcess(inventory, before, { pid: 123 })).toBeNull()
    expect(selectNativeProcess(inventory, before, { pid: 789 })).toEqual(inventory[2])
    const directory = mkdtempSync(join(tmpdir(), 'orca-native-metadata-contract-'))
    directories.push(directory)
    expect(readNativeRuntime(directory)).toEqual({ error: 'ENOENT' })
    writeFileSync(
      join(directory, 'orca-runtime.json'),
      JSON.stringify({ pid: 789, startedAt: 1, transports: [], authToken: 'must-not-be-recorded' })
    )
    expect(readNativeRuntime(directory)).toEqual({ pid: 789, startedAt: 1, transports: [] })
  })
  it('saves native replacement before readiness and retains failure diagnostics without passing', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'orca-native-relaunch-contract-'))
    directories.push(directory)
    const native = {
      pid: 456,
      diskVersion: '1.0.1',
      command: '/fixture/Orca.app/Contents/MacOS/Orca'
    }
    const context = {
      native,
      oldPid: 123,
      appPath: '/fixture/Orca.app',
      profile: directory,
      output: directory
    }
    await expect(
      observeNativeRelaunch(
        context,
        async () => {
          const saved = JSON.parse(readFileSync(join(directory, 'native-relaunch.json'), 'utf8'))
          expect(saved).toMatchObject({
            ...native,
            oldPid: 123,
            mockKeychainArgumentRetained: false
          })
          throw new Error('fixture native runtime absent')
        },
        () => ({ sample: { pid: 456 }, statePaths: [`${directory}/logs/daemon.log`] })
      )
    ).rejects.toThrow('fixture native runtime absent')
    const saved = JSON.parse(readFileSync(join(directory, 'native-relaunch.json'), 'utf8'))
    expect(saved.readiness).toBeUndefined()
    expect(saved.readinessError).toContain('fixture native runtime absent')
    expect(saved.diagnostics.sample.pid).toBe(456)
    expect(
      nativeStatePaths(
        `p456\nn/unrelated/private.txt\nn${directory}/orca-runtime.json\nn/Users/runner/Library/Application Support/Orca/logs/main.log`,
        directory
      )
    ).toEqual([
      `${directory}/orca-runtime.json`,
      '/Users/runner/Library/Application Support/Orca/logs/main.log'
    ])
  })
  it('bounds renderer diagnostics even when the page never responds', async () => {
    await expect(startupDeadline(new Promise(() => {}), 'Fixture renderer', 10)).rejects.toThrow(
      'Fixture renderer timed out after 10ms'
    )
  })

  it('retains actual startup diagnostics and closes an app that never reaches readiness', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'orca-startup-contract-'))
    directories.push(directory)
    const details = { home: directory, packaged: true, visibleWindows: 0, version: '1.0.0' }
    const events = []
    const page = {
      url: () => 'file:///fixture/index.html',
      on: (event) => events.push(event),
      waitForLoadState: async () => {},
      evaluate: async () => ({ hasApi: true, hasStore: false, workspaceSessionReady: null }),
      screenshot: async () => {},
      waitForFunction: async () => {
        expect(JSON.parse(readFileSync(join(directory, 'before-process.json'), 'utf8'))).toEqual(
          details
        )
        throw new Error('fixture readiness timeout')
      }
    }
    const app = {
      process: () => ({}),
      evaluate: async () => details,
      firstWindow: async () => page,
      windows: () => [page]
    }
    let closed = false
    await expect(
      readyOrca(
        app,
        { isolatedHome: directory, realHome: '/non-fixture-home' },
        directory,
        'before',
        async (owned) => {
          expect(owned).toBe(app)
          closed = true
        }
      )
    ).rejects.toThrow('fixture readiness timeout')
    expect(closed).toBe(true)
    expect(events).toEqual(['pageerror', 'console'])
    const failure = JSON.parse(readFileSync(join(directory, 'before-failed-startup.json'), 'utf8'))
    expect(failure[0].state).toMatchObject({
      hasApi: true,
      hasStore: false,
      workspaceSessionReady: null
    })
  })

  it('requires fresh output from the original shell variable, not command echo or old scrollback', () => {
    const marker = '1234567890abcdef1234567890abcdef'
    const before = continuityCommand(marker, true)
    const after = continuityCommand(marker, false)
    expect(before).toContain(`export ORCA_UPDATE_CONTINUITY='${marker}'`)
    expect(before).not.toContain(`ORCA_BEFORE_${marker}`)
    expect(before).not.toContain('ORCA_AFTER_')
    expect(after).toContain('"$ORCA_UPDATE_CONTINUITY"')
    expect(after).not.toContain(marker)
    expect(after).not.toContain('export ')
    expect(after).toContain('ORCA_AFTER_%s')
    const restoredHistory = `ORCA_BEFORE_${marker}\n${after}\nORCA_AFTER_\n`
    expect(hasContinuityOutput(restoredHistory, marker, false)).toBe(false)
    expect(hasContinuityOutput(`${restoredHistory}ORCA_AFTER_${marker}\n`, marker, false)).toBe(
      true
    )
  })
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
    const runtime = readFileSync(new URL('./probe-runtime.mjs', import.meta.url), 'utf8')
    const packagedFixture = readFileSync('tests/e2e/helpers/packaged-issues-journey.ts', 'utf8')
    expect(runtime).toContain("process.platform === 'darwin' ? ['--use-mock-keychain'] : []")
    expect(packagedFixture).toContain(
      "process.platform === 'darwin' ? ['--use-mock-keychain'] : []"
    )
    const native = readFileSync(new URL('./probe-native-relaunch.mjs', import.meta.url), 'utf8')
    expect(native).toContain(
      "mockKeychainArgumentRetained: native.command.includes('--use-mock-keychain')"
    )
    expect(build.match(/runBuild\(\['run', 'build:release'\]/g)).toHaveLength(1)
    expect(build).toContain('config/scripts/integration-builds/electron-builder.cjs')
    expect(build).not.toContain('afterPack:')
    expect(build).not.toContain('afterSign:')
    expect(build).not.toContain("'--dir'")
    expect(build).toContain("'app-update.yml'")
    expect(build).toContain('zipPackages: 2')
    expect(run).toContain('zip: build.zips[1]')
    expect(run).not.toContain('/usr/bin/ditto')
    expect(run).toContain('window.api.updater.check()')
    expect(run).toContain('window.api.updater.quitAndInstall()')
    expect(run).not.toContain('localBuild: true')
    expect(run.indexOf('identity.cleanup()')).toBeLessThan(run.indexOf('await launchOrca('))
  })
})
