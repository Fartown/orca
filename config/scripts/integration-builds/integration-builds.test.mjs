import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'yaml'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ANDROID_CERT_SHA256,
  buildIdentity,
  integrationTag,
  verifyAndroidCertificate,
  verifyAndroidPublicCertificate
} from './build-identity.mjs'
import { hashPackages, PACKAGE_NAMES, publishRelease } from './publish-release.mjs'
import androidConfig from './android-config.cjs'
import { verifyAndroidPackageVersion } from './verify-apk-version.mjs'
import { signIntegrationPackage } from './mac-after-sign.cjs'

const sha = 'a'.repeat(40)
const timestamp = 1789228800000
const env = {
  GITHUB_REPOSITORY: 'Fartown/orca',
  GITHUB_REF: 'refs/heads/fork/integration',
  GITHUB_EVENT_NAME: 'push',
  GITHUB_SHA: sha,
  GITHUB_RUN_ID: '123',
  ORCA_LOCAL_BUILD_VERSION: `1.2.3-local.${timestamp}.${sha.slice(0, 12)}`
}
const mobile = { expo: { version: '0.0.48', android: { versionCode: 16 } } }
const directories = []
const require = createRequire(import.meta.url)

function packages() {
  const directory = mkdtempSync(join(tmpdir(), 'orca-integration-packages-'))
  directories.push(directory)
  PACKAGE_NAMES.forEach((name) => writeFileSync(join(directory, name), name))
  return directory
}

function github(existing) {
  return vi.fn((args) => {
    if (args[0] === 'api') {
      if (existing) {
        return JSON.stringify(existing)
      }
      throw Object.assign(new Error('Not found'), { stderr: 'gh: Not Found (HTTP 404)' })
    }
    return ''
  })
}

afterEach(() => {
  directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }))
  vi.unstubAllEnvs()
  delete require.cache[require.resolve('./electron-builder.cjs')]
  delete require.cache[require.resolve('../../electron-builder.config.cjs')]
})

describe('integration package identity and signing', () => {
  it('refuses publishing an ad-hoc package when publisher credentials are absent', async () => {
    await expect(signIntegrationPackage({ electronPlatformName: 'darwin' }, env)).rejects.toThrow(
      /Fixed publisher/
    )
    await expect(
      signIntegrationPackage(
        { electronPlatformName: 'darwin' },
        { GITHUB_EVENT_NAME: 'pull_request' }
      )
    ).resolves.toBeUndefined()
    await expect(
      signIntegrationPackage({ electronPlatformName: 'linux' }, env)
    ).resolves.toBeUndefined()
  })
  it('verifies the actual APK native version and embedded update channel together', () => {
    const code = androidConfig.androidVersionCode(timestamp)
    const badging = `package: name='com.stably.orca.mobile' versionCode='${code}'`
    const config = { android: { versionCode: code }, extra: { orcaUpdateChannel: 'integration' } }
    expect(() => verifyAndroidPackageVersion(badging, config, code)).not.toThrow()
    expect(() => verifyAndroidPackageVersion(badging, { ...config, extra: {} }, code)).toThrow()
    expect(() => verifyAndroidPackageVersion(badging, config, code + 1)).toThrow()
  })
  it('uses increasing native versions only for integration builds', () => {
    const config = { android: { versionCode: 16 }, extra: { existing: true } }
    expect(androidConfig.withIntegrationBuild(config, {})).toBe(config)
    const code = androidConfig.androidVersionCode(timestamp)
    expect(androidConfig.androidVersionCode(timestamp + 1000)).toBe(code + 1)
    expect(
      androidConfig.withIntegrationBuild(config, { ORCA_INTEGRATION_VERSION_CODE: String(code) })
    ).toEqual({
      android: { versionCode: code, permissions: ['REQUEST_INSTALL_PACKAGES'] },
      extra: { existing: true, orcaUpdateChannel: 'integration' }
    })
    for (const value of ['16', 'NaN', '-1', '2100000001']) {
      expect(() =>
        androidConfig.withIntegrationBuild(config, { ORCA_INTEGRATION_VERSION_CODE: value })
      ).toThrow()
    }
  })
  it('reuses local version identity and gives each workflow a separate non-release tag', () => {
    expect(buildIdentity({ sha, runId: '123', baseVersion: '1.2.3', timestamp })).toEqual({
      sha,
      tag: `integration-123-${sha.slice(0, 12)}`,
      version: `1.2.3-local.${timestamp}.${sha.slice(0, 12)}`,
      androidVersionCode: androidConfig.androidVersionCode(timestamp)
    })
    expect(integrationTag(sha, '124')).not.toBe(integrationTag(sha, '123'))
    expect(() => integrationTag('branch/name', '123')).toThrow()
    expect(() => integrationTag(sha, '123\nother=value')).toThrow()
  })

  it('accepts only the existing Expo signing certificate', () => {
    const certificate = readFileSync(
      new URL('./expo-debug-certificate.pem', import.meta.url),
      'utf8'
    )
    const output = `Verifies\nSigner #1 certificate SHA-256 digest: ${ANDROID_CERT_SHA256}\n${certificate}`
    expect(() => verifyAndroidCertificate(output)).not.toThrow()
    expect(() => verifyAndroidCertificate(output.replace('3jb2aiJKg==', '3jb2aiJKQ=='))).toThrow()
    expect(() => verifyAndroidCertificate('DOES NOT VERIFY')).toThrow()
    const ranged = output.replace(
      'Signer #1',
      'Signer (minSdkVersion=24, maxSdkVersion=2147483647)'
    )
    expect(() => verifyAndroidCertificate(ranged)).not.toThrow()
    expect(() => verifyAndroidCertificate(ranged + output)).not.toThrow()
    expect(() =>
      verifyAndroidCertificate(ranged + output.replace('3jb2aiJKg==', '3jb2aiJKQ=='))
    ).toThrow()
  })

  it('pins the actual template public certificate before the expensive Android build', () => {
    const certificate = readFileSync(new URL('./expo-debug-certificate.pem', import.meta.url))
    expect(() => verifyAndroidPublicCertificate(certificate)).not.toThrow()
    expect(() => verifyAndroidPublicCertificate('not a certificate')).toThrow()
    const changed = certificate.toString().replace('3jb2aiJKg==', '3jb2aiJKQ==')
    expect(() => verifyAndroidPublicCertificate(changed)).toThrow()
  })

  it('keeps packaging hooks and resources while pinning fork update metadata', () => {
    vi.stubEnv('ORCA_LOCAL_BUILD_VERSION', env.ORCA_LOCAL_BUILD_VERSION)
    vi.stubEnv('ORCA_INTEGRATION_TAG', integrationTag(sha, '123'))
    const upstream = require('../../electron-builder.config.cjs')
    const config = require('./electron-builder.cjs')
    expect(config.afterPack).toBe(upstream.afterPack)
    expect(config.beforeBuild).toBe(upstream.beforeBuild)
    expect(config.afterSign).toBeTypeOf('function')
    expect(config.mac.extraResources).toBe(upstream.mac.extraResources)
    expect(config.publish).toEqual({
      provider: 'generic',
      url: `https://github.com/Fartown/orca/releases/download/${integrationTag(sha, '123')}`
    })
    expect(config.mac.identity).toBe('-')
    expect(config.mac.hardenedRuntime).toBe(false)
    expect(config.mac.notarize).toBe(false)
    expect(config.mac.target).toEqual(['dmg', 'zip'])
    expect(config.extraMetadata.orcaUpdateChannel).toBe('integration')
    expect(config.extraMetadata.version).toBe(env.ORCA_LOCAL_BUILD_VERSION)
  })

  it('refuses mixing formal release credentials and integration packaging', () => {
    vi.stubEnv('ORCA_LOCAL_BUILD_VERSION', env.ORCA_LOCAL_BUILD_VERSION)
    vi.stubEnv('ORCA_MAC_RELEASE', '1')
    expect(() => require('./electron-builder.cjs')).toThrow(/release-channel/)
  })
})

describe('complete, immutable fork prereleases', () => {
  it('creates a draft, uploads all five packages and update manifests, then publishes', async () => {
    const directory = packages()
    const gh = github()
    await publishRelease({ env, directory, mobile, gh })
    expect(gh.mock.calls.map(([args]) => args.slice(0, 2))).toEqual([
      ['api', `repos/Fartown/orca/releases/tags/${integrationTag(sha, '123')}`],
      ['release', 'create'],
      ['release', 'upload'],
      ['release', 'edit']
    ])
    expect(gh.mock.calls[1][0]).toContain('--draft')
    expect(gh.mock.calls[3][0]).toContain('--draft=false')
    for (const [args] of gh.mock.calls.slice(1)) {
      expect(args).toContain('Fartown/orca')
    }
    const manifest = JSON.parse(readFileSync(join(directory, 'build-info.json'), 'utf8'))
    expect(manifest.sha).toBe(sha)
    expect(manifest.assets).toHaveLength(5)
    expect(manifest.androidVersionCode).toBe(androidConfig.androidVersionCode(timestamp))
    const update = parse(readFileSync(join(directory, 'latest-mac.yml'), 'utf8'))
    expect(update.version).toBe(env.ORCA_LOCAL_BUILD_VERSION)
    expect(update.files).toEqual(
      manifest.assets
        .filter((asset) => asset.name.endsWith('.zip'))
        .map((asset) => ({ url: asset.name, sha512: asset.sha512, size: asset.bytes }))
    )
    expect(gh.mock.calls[2][0]).toContain(join(directory, 'latest-mac.yml'))
    expect(readFileSync(join(directory, 'SHA256SUMS.txt'), 'utf8')).toMatch(/^[a-f0-9]{64}  orca-/)
  })

  it('does not create a release when one platform is missing or empty', async () => {
    const directory = packages()
    const gh = github()
    writeFileSync(join(directory, PACKAGE_NAMES[2]), '')
    await expect(publishRelease({ env, directory, mobile, gh })).rejects.toThrow(/empty/)
    expect(gh).not.toHaveBeenCalled()
    rmSync(join(directory, PACKAGE_NAMES[2]))
    await expect(hashPackages(directory)).rejects.toThrow()
  })

  it.each([
    { GITHUB_REPOSITORY: 'stablyai/orca' },
    { GITHUB_REF: 'refs/heads/main' },
    { GITHUB_EVENT_NAME: 'pull_request' }
  ])('cannot publish outside the integration branch: %j', async (override) => {
    const gh = github()
    await expect(
      publishRelease({ env: { ...env, ...override }, directory: packages(), mobile, gh })
    ).rejects.toThrow(/Only the fork/)
    expect(gh).not.toHaveBeenCalled()
  })

  it('keeps the release draft if an upload fails', async () => {
    const gh = github()
    gh.mockImplementationOnce(() => {
      throw Object.assign(new Error('Not found'), { stderr: 'HTTP 404' })
    })
      .mockImplementationOnce(() => '')
      .mockImplementationOnce(() => {
        throw new Error('upload failed')
      })
    await expect(publishRelease({ env, directory: packages(), mobile, gh })).rejects.toThrow(
      'upload failed'
    )
    expect(gh.mock.calls.some(([args]) => args[1] === 'edit')).toBe(false)
  })

  it('retries a matching draft without overwriting a published release', async () => {
    const existing = { target_commitish: sha, prerelease: true, draft: true }
    const gh = github(existing)
    await publishRelease({ env, directory: packages(), mobile, gh })
    expect(gh.mock.calls.some(([args]) => args[1] === 'create')).toBe(false)
    await expect(
      publishRelease({
        env,
        directory: packages(),
        mobile,
        gh: github({ ...existing, draft: false })
      })
    ).rejects.toThrow(/Already published/)
    await expect(
      publishRelease({
        env,
        directory: packages(),
        mobile,
        gh: github({ ...existing, target_commitish: 'b'.repeat(40) })
      })
    ).rejects.toThrow(/identity/)
  })

  it('does not mistake GitHub authentication failure for a missing release', async () => {
    const gh = vi.fn(() => {
      throw Object.assign(new Error('auth failed'), { stderr: 'HTTP 401' })
    })
    await expect(publishRelease({ env, directory: packages(), mobile, gh })).rejects.toThrow(
      'auth failed'
    )
    expect(gh).toHaveBeenCalledTimes(1)
  })
})

describe('workflow wiring', () => {
  it('isolates temporary signing probes from release builds and publication', () => {
    const workflow = parse(readFileSync('.github/workflows/fork-integration-build.yml', 'utf8'))
    expect(workflow.on.workflow_dispatch.inputs.signing_probe_only.default).toBe(false)
    expect(workflow.jobs.identity.if).toContain('!inputs.signing_probe_only')
    const probe = workflow.jobs['signing-probe']
    expect(probe.if).toContain("github.event_name == 'workflow_dispatch'")
    expect(probe.if).toContain('inputs.signing_probe_only')
    expect(probe.strategy.matrix.runner).toEqual(['macos-15', 'macos-15-intel'])
    expect(probe.steps[0].with.ref).toBe('${{ github.sha }}')
    expect(JSON.stringify(probe)).not.toContain('secrets.')
    expect(probe.steps.at(-1).with.path).toContain('${{ runner.temp }}/signing-probe-evidence')
    expect(probe.steps.at(-1).with.path).toContain(
      '!${{ runner.temp }}/signing-probe-evidence/**/*.app/**'
    )
  })

  it('pins all jobs to one SHA, builds in parallel and publishes only a complete integration run', () => {
    const workflow = parse(readFileSync('.github/workflows/fork-integration-build.yml', 'utf8'))
    expect(workflow.on.push.branches).toEqual(['fork/integration'])
    expect(workflow.on).toHaveProperty('workflow_dispatch')
    expect(workflow.concurrency['cancel-in-progress']).toBe(
      "${{ github.event_name == 'pull_request' }}"
    )
    expect(workflow.jobs.identity.if).toContain("github.repository == 'Fartown/orca'")
    for (const name of ['macos', 'android']) {
      const job = workflow.jobs[name]
      expect(job.needs).toBe('identity')
      expect(job.steps[0].with.ref).toBe('${{ needs.identity.outputs.sha }}')
      expect(
        job.steps.find((step) => step.with?.name?.startsWith('integration-')).with[
          'if-no-files-found'
        ]
      ).toBe('error')
    }
    expect(workflow.jobs.macos.strategy.matrix.include.map((row) => row.arch)).toEqual([
      'arm64',
      'x64'
    ])
    expect(
      workflow.jobs.macos.steps.find(
        (step) => step.name === 'Package internal-test DMG and update ZIP'
      ).run
    ).toContain('--publish never')
    expect(workflow.jobs.publish.needs).toEqual(['identity', 'macos', 'android'])
    expect(workflow.jobs.macos.env.CSC_FOR_PULL_REQUEST).toBe('true')
    expect(workflow.jobs.publish.if).toContain("github.ref == 'refs/heads/fork/integration'")
    expect(workflow.jobs.publish.if).not.toContain('always()')
    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(workflow.jobs.publish.permissions).toEqual({ contents: 'write' })
    expect(workflow.env.ORCA_BACKGROUND_LAUNCH).toBe('1')
  })
})
