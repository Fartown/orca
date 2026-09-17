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
import {
  hashPackages,
  listMergedChanges,
  PACKAGE_NAMES,
  parseMergedChanges,
  publishRelease
} from './publish-release.mjs'
import { integrationVersion, listIntegrationReleases } from './integration-releases.mjs'
import { LEGACY_INTEL_PLACEHOLDER } from './legacy-intel-placeholder.mjs'
import androidConfig from './android-config.cjs'
import { verifyAndroidPackageVersion } from './verify-apk-version.mjs'
import { signIntegrationPackage } from './mac-after-sign.cjs'
import { signingCertificate } from './mac-signing.cjs'

const sha = 'a'.repeat(40)
const timestamp = 1789228800000
const env = {
  GITHUB_REPOSITORY: 'Fartown/orca',
  GITHUB_REF: 'refs/heads/fork/integration',
  GITHUB_EVENT_NAME: 'push',
  GITHUB_SHA: sha,
  GITHUB_RUN_ID: '123',
  // One integration build (previousRelease) is already published.
  ORCA_LOCAL_BUILD_VERSION: '1.2.3-preview.2',
  ORCA_INTEGRATION_VERSION_CODE: String(androidConfig.androidVersionCode(timestamp))
}
const mobile = { expo: { version: '0.0.48', android: { versionCode: 16 } } }
const directories = []
const require = createRequire(import.meta.url)

function packages() {
  const directory = mkdtempSync(join(tmpdir(), 'orca-integration-packages-'))
  directories.push(directory)
  PACKAGE_NAMES.forEach((name) => writeFileSync(join(directory, name), name))
  const certificate = signingCertificate()
  writeFileSync(
    join(directory, 'mac-signing-arm64.json'),
    JSON.stringify({
      schemaVersion: 1,
      arch: 'arm64',
      version: env.ORCA_LOCAL_BUILD_VERSION,
      certificateSha256: certificate.sha256,
      requirement: `identifier "com.stably.orca" and certificate root = H"${certificate.sha1}"`
    })
  )
  return directory
}

const previousSha = 'b'.repeat(40)
const previousRelease = {
  tag_name: `integration-122-${previousSha.slice(0, 12)}`,
  target_commitish: previousSha,
  draft: false,
  prerelease: true
}
const mergeLog = [
  'Merge pull request #31 from Fartown/feat/integration-builds-release-notes\n\nfeat(integration-builds): list merged pull requests\n',
  "Merge remote-tracking branch 'upstream/main' into fork/integration\n",
  'Merge pull request #30 from Fartown/feat/self-hosted-artifacts-lan-share\n'
]
  .map((message) => `${message}\0`)
  .join('\n')

function github(existing, releases = [previousRelease]) {
  return vi.fn((args) => {
    if (args[0] === 'api') {
      if (args.includes('--slurp')) {
        return JSON.stringify([releases.slice(0, 2), releases.slice(2)])
      }
      if (existing) {
        return JSON.stringify(existing)
      }
      throw Object.assign(new Error('Not found'), { stderr: 'gh: Not Found (HTTP 404)' })
    }
    return ''
  })
}

function repository({ ancestor = true, log = mergeLog } = {}) {
  return vi.fn((args) => {
    if (args[0] === 'merge-base' && !ancestor) {
      throw new Error('Command failed: git merge-base --is-ancestor')
    }
    return args[0] === 'log' ? log : ''
  })
}

afterEach(() => {
  directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }))
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
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
  it('numbers each build after the published ones and gives each workflow its own tag', () => {
    expect(
      buildIdentity({ sha, runId: '123', baseVersion: '1.2.3', timestamp, publishedCount: 41 })
    ).toEqual({
      sha,
      tag: `integration-123-${sha.slice(0, 12)}`,
      version: '1.2.3-preview.42',
      androidVersionCode: androidConfig.androidVersionCode(timestamp)
    })
    expect(integrationVersion('1.2.3', 0)).toBe('1.2.3-preview.1')
    expect(() => integrationVersion('1.2.3-rc.1', 0)).toThrow(/plain x.y.z/)
    for (const count of [-1, 1.5, Number.NaN]) {
      expect(() => integrationVersion('1.2.3', count)).toThrow()
    }
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
  it('creates a draft, uploads every package and update manifest, then publishes', async () => {
    const directory = packages()
    const gh = github()
    await publishRelease({ env, directory, mobile, gh, git: repository() })
    expect(gh.mock.calls.map(([args]) => args.slice(0, 2))).toEqual([
      ['api', '--paginate'],
      ['api', `repos/Fartown/orca/releases/tags/${integrationTag(sha, '123')}`],
      ['release', 'create'],
      ['release', 'upload'],
      ['release', 'edit']
    ])
    expect(gh.mock.calls[2][0]).toContain('--draft')
    expect(gh.mock.calls[2][0]).toContain('Orca 1.2.3-preview.2')
    expect(gh.mock.calls[4][0]).toContain('--draft=false')
    for (const [args] of gh.mock.calls.slice(2)) {
      expect(args).toContain('Fartown/orca')
    }
    const manifest = JSON.parse(readFileSync(join(directory, 'build-info.json'), 'utf8'))
    expect(manifest.sha).toBe(sha)
    expect(manifest.assets.map((asset) => asset.name)).toEqual([
      ...PACKAGE_NAMES,
      LEGACY_INTEL_PLACEHOLDER
    ])
    expect(manifest.androidVersionCode).toBe(androidConfig.androidVersionCode(timestamp))
    expect(manifest.desktopVersion).toBe('1.2.3-preview.2')
    expect(manifest.macCertificateSha256).toBe(signingCertificate().sha256)
    expect(manifest.macSigning).toBe('fixed self-signed publisher, not notarized')
    const update = parse(readFileSync(join(directory, 'latest-mac.yml'), 'utf8'))
    expect(update.version).toBe(env.ORCA_LOCAL_BUILD_VERSION)
    expect(update.files).toEqual(
      manifest.assets
        .filter((asset) => asset.name === 'orca-integration-macos-arm64.zip')
        .map((asset) => ({ url: asset.name, sha512: asset.sha512, size: asset.bytes }))
    )
    expect(gh.mock.calls[3][0]).toContain(join(directory, 'latest-mac.yml'))
    expect(readFileSync(join(directory, 'SHA256SUMS.txt'), 'utf8')).toMatch(/^[a-f0-9]{64}  orca-/)
  })

  it('keeps releases complete for apps that still expect an Intel update ZIP', async () => {
    const directory = packages()
    const gh = github()
    await publishRelease({ env, directory, mobile, gh, git: repository() })
    // What integration apps built before Intel was dropped require for a Mac release.
    const olderAppRequirement = [
      'build-info.json',
      'latest-mac.yml',
      'orca-integration-macos-arm64.zip',
      'orca-integration-macos-x64.zip'
    ]
    const uploaded = gh.mock.calls.find(([args]) => args[1] === 'upload')[0]
    for (const name of olderAppRequirement) {
      expect(uploaded).toContain(join(directory, name))
    }
    const placeholder = readFileSync(join(directory, LEGACY_INTEL_PLACEHOLDER))
    expect(placeholder.readUInt32LE(0)).toBe(0x04034b50)
    expect(placeholder.toString('latin1')).toContain('This archive is not an app.')
    const manifest = JSON.parse(readFileSync(join(directory, 'build-info.json'), 'utf8'))
    expect(manifest.assets.find((asset) => asset.name === LEGACY_INTEL_PLACEHOLDER).bytes).toBe(
      placeholder.length
    )
    expect(readFileSync(join(directory, 'latest-mac.yml'), 'utf8')).not.toContain('x64')
    expect(readFileSync(join(directory, 'release-notes.md'), 'utf8')).toContain(
      'Intel 版已停止提供'
    )
  })

  it('does not create a release when one platform is missing or empty', async () => {
    const directory = packages()
    const gh = github()
    writeFileSync(join(directory, PACKAGE_NAMES[2]), '')
    await expect(publishRelease({ env, directory, mobile, gh, git: repository() })).rejects.toThrow(
      /empty/
    )
    expect(gh).not.toHaveBeenCalled()
    rmSync(join(directory, PACKAGE_NAMES[2]))
    await expect(hashPackages(directory)).rejects.toThrow()
  })

  it.each(['certificateSha256', 'version', 'arch', 'requirement'])(
    'refuses publication when signing evidence has an invalid %s',
    async (field) => {
      const directory = packages()
      const path = join(directory, 'mac-signing-arm64.json')
      const evidence = JSON.parse(readFileSync(path, 'utf8'))
      evidence[field] = 'invalid'
      writeFileSync(path, JSON.stringify(evidence))
      const gh = github()
      const git = repository()
      await expect(publishRelease({ env, directory, mobile, gh, git })).rejects.toThrow()
      expect(gh).not.toHaveBeenCalled()
      rmSync(path)
      await expect(publishRelease({ env, directory, mobile, gh, git })).rejects.toThrow()
      expect(gh).not.toHaveBeenCalled()
    }
  )

  it.each([
    { GITHUB_REPOSITORY: 'stablyai/orca' },
    { GITHUB_REF: 'refs/heads/main' },
    { GITHUB_EVENT_NAME: 'pull_request' }
  ])('cannot publish outside the integration branch: %j', async (override) => {
    const gh = github()
    await expect(
      publishRelease({
        env: { ...env, ...override },
        directory: packages(),
        mobile,
        gh,
        git: repository()
      })
    ).rejects.toThrow(/Only the fork/)
    expect(gh).not.toHaveBeenCalled()
  })

  it('keeps the release draft if an upload fails', async () => {
    const listed = github()
    const gh = vi.fn((args) => {
      if (args[1] === 'upload') {
        throw new Error('upload failed')
      }
      return listed(args)
    })
    await expect(
      publishRelease({ env, directory: packages(), mobile, gh, git: repository() })
    ).rejects.toThrow('upload failed')
    expect(gh.mock.calls.some(([args]) => args[1] === 'create')).toBe(true)
    expect(gh.mock.calls.some(([args]) => args[1] === 'edit')).toBe(false)
  })

  it('retries a matching draft without overwriting a published release', async () => {
    const existing = { target_commitish: sha, prerelease: true, draft: true }
    const gh = github(existing)
    const git = repository()
    await publishRelease({ env, directory: packages(), mobile, gh, git })
    expect(gh.mock.calls.some(([args]) => args[1] === 'create')).toBe(false)
    await expect(
      publishRelease({
        env,
        directory: packages(),
        mobile,
        gh: github({ ...existing, draft: false }),
        git
      })
    ).rejects.toThrow(/Already published/)
    await expect(
      publishRelease({
        env,
        directory: packages(),
        mobile,
        gh: github({ ...existing, target_commitish: 'b'.repeat(40) }),
        git
      })
    ).rejects.toThrow(/identity/)
  })

  it('does not mistake GitHub authentication failure for a missing release', async () => {
    const gh = vi.fn(() => {
      throw Object.assign(new Error('auth failed'), { stderr: 'HTTP 401' })
    })
    await expect(
      publishRelease({ env, directory: packages(), mobile, gh, git: repository() })
    ).rejects.toThrow('auth failed')
    expect(gh).toHaveBeenCalledTimes(1)
  })

  it.each([
    [
      'a newer build took its number',
      [previousRelease, { ...previousRelease, tag_name: 'integration-124-cccccccccccc' }]
    ],
    ['no build is published yet', []],
    [
      'a newer run already published',
      [{ ...previousRelease, tag_name: 'integration-124-cccccccccccc' }]
    ]
  ])('refuses a stale build number when %s', async (_, releases) => {
    const gh = github(undefined, releases)
    await expect(
      publishRelease({ env, directory: packages(), mobile, gh, git: repository() })
    ).rejects.toThrow(/stale/)
    expect(gh.mock.calls.some(([args]) => args[0] === 'release')).toBe(false)
  })

  it.each([
    { ORCA_LOCAL_BUILD_VERSION: `1.2.3-local.${timestamp}.${sha.slice(0, 12)}` },
    { ORCA_LOCAL_BUILD_VERSION: '1.2.3-preview.0' },
    { ORCA_INTEGRATION_VERSION_CODE: undefined },
    { ORCA_INTEGRATION_VERSION_CODE: '16' }
  ])(
    'refuses an unnumbered version or invalid Android code before any GitHub call: %j',
    async (override) => {
      const gh = github()
      await expect(
        publishRelease({
          env: { ...env, ...override },
          directory: packages(),
          mobile,
          gh,
          git: repository()
        })
      ).rejects.toThrow()
      expect(gh).not.toHaveBeenCalled()
    }
  )
})

describe('what merged since the previous integration build', () => {
  it('counts and compares only published integration builds across every page', () => {
    const releases = listIntegrationReleases(
      github(undefined, [
        { ...previousRelease, tag_name: 'integration-124-cccccccccccc' },
        { ...previousRelease, tag_name: 'integration-121-cccccccccccc', target_commitish: sha },
        { ...previousRelease, tag_name: 'integration-120-dddddddddddd', draft: true },
        { ...previousRelease, tag_name: 'v1.2.3' },
        { ...previousRelease, tag_name: 'integration-119-dddddddddddd', prerelease: false },
        previousRelease,
        {
          ...previousRelease,
          tag_name: 'integration-100-eeeeeeeeeeee',
          target_commitish: 'e'.repeat(40)
        }
      ]),
      'Fartown/orca'
    )
    expect(releases.map((release) => release.run)).toEqual([124, 121, 122, 100])
    const git = repository()
    expect(listMergedChanges({ releases, git, sha, runId: '123' }).previous).toBe(releases[2])
    expect(git.mock.calls[0][0]).toEqual(['merge-base', '--is-ancestor', previousSha, sha])
  })

  it('lists first-parent merges since the newest earlier published build', async () => {
    const directory = packages()
    const git = repository()
    await publishRelease({ env, directory, mobile, gh: github(), git })
    expect(git.mock.calls.map(([args]) => args)).toEqual([
      ['merge-base', '--is-ancestor', previousSha, sha],
      [
        'log',
        '--first-parent',
        '--max-count=100',
        '--format=%B%x00',
        `${previousSha}..${sha}`,
        '--'
      ]
    ])
    const changes = [
      { number: 31, title: 'feat(integration-builds): list merged pull requests' },
      { title: "Merge remote-tracking branch 'upstream/main' into fork/integration" },
      { number: 30, title: 'Fartown/feat/self-hosted-artifacts-lan-share' }
    ]
    expect(JSON.parse(readFileSync(join(directory, 'build-info.json'), 'utf8')).changes).toEqual(
      changes
    )
    const notes = readFileSync(join(directory, 'release-notes.md'), 'utf8')
    expect(notes).toContain(
      `[integration-122-${previousSha.slice(0, 12)}](https://github.com/Fartown/orca/releases/tag/integration-122-${previousSha.slice(0, 12)})`
    )
    expect(notes).toContain(`https://github.com/Fartown/orca/compare/${previousSha}...${sha}`)
    expect(notes).toContain(
      [
        '- #31 feat(integration-builds): list merged pull requests',
        "- Merge remote-tracking branch 'upstream/main' into fork/integration",
        '- #30 Fartown/feat/self-hosted-artifacts-lan-share'
      ].join('\n')
    )
  })

  it.each([
    ['the previous build is not an ancestor', repository({ ancestor: false }), [previousRelease]],
    ['no earlier build was published', repository(), []]
  ])('falls back to the head commit when %s', (_, git, releases) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = listMergedChanges({
      releases: listIntegrationReleases(github(undefined, releases), 'Fartown/orca'),
      git,
      sha,
      runId: '123'
    })
    expect(result.previous).toBe(null)
    expect(git.mock.calls.at(-1)[0]).toEqual([
      'log',
      '--first-parent',
      '--max-count=1',
      '--format=%B%x00',
      sha,
      '--'
    ])
    expect(warn).toHaveBeenCalledTimes(releases.length ? 1 : 0)
  })

  it('keeps release titles short and ignores empty messages', () => {
    const long = 'x'.repeat(250)
    expect(parseMergedChanges(`\0\n${long}\0\n`)).toEqual([{ title: `${'x'.repeat(199)}…` }])
  })
})

describe('workflow wiring', () => {
  it('limits publisher secrets to integration packaging and always cleans them up', () => {
    const workflow = parse(readFileSync('.github/workflows/fork-integration-build.yml', 'utf8'))
    const steps = workflow.jobs.macos.steps
    const prepare = steps.find((step) => step.name === 'Prepare fixed publisher signing key')
    expect(prepare.if).toContain("github.ref == 'refs/heads/fork/integration'")
    expect(prepare.if).toContain("github.event_name != 'pull_request'")
    expect(Object.keys(prepare.env)).toEqual([
      'ORCA_MAC_SIGN_PRIVATE_KEY_PEM',
      'ORCA_MAC_SIGN_KEY_PASSWORD'
    ])
    const cleanup = steps.find((step) => step.name === 'Remove temporary publisher private key')
    expect(cleanup.if).toContain('always()')
    expect(cleanup.run).toContain('mac-signing.cjs cleanup')
    expect(
      steps.find((step) => step.name === 'Verify fixed publisher and package identity').run
    ).toContain('mac-package-signature.mjs')
    expect(JSON.stringify(workflow.jobs.publish)).not.toContain('secrets.')
  })
  it('isolates temporary signing probes from release builds and publication', () => {
    const workflow = parse(readFileSync('.github/workflows/fork-integration-build.yml', 'utf8'))
    expect(workflow.on.workflow_dispatch.inputs.signing_probe_only.default).toBe(false)
    expect(workflow.jobs.identity.if).toContain('!inputs.signing_probe_only')
    const probe = workflow.jobs['signing-probe']
    expect(probe.if).toContain("github.event_name == 'workflow_dispatch'")
    expect(probe.if).toContain('inputs.signing_probe_only')
    expect(probe.strategy.matrix.runner).toEqual(['macos-15'])
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
    expect(workflow.jobs.macos.strategy.matrix.include.map((row) => row.arch)).toEqual(['arm64'])
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
    // Numbering reads published releases; publishing re-checks the number and needs the Android code.
    expect(workflow.jobs.identity.steps.at(-1).env).toEqual({ GH_TOKEN: '${{ github.token }}' })
    expect(workflow.jobs.identity.permissions).toBeUndefined()
    expect(workflow.jobs.publish.steps.at(-1).env).toMatchObject({
      ORCA_LOCAL_BUILD_VERSION: '${{ needs.identity.outputs.version }}',
      ORCA_INTEGRATION_VERSION_CODE: '${{ needs.identity.outputs.androidVersionCode }}'
    })
    expect(workflow.jobs.publish.steps[0].with).toMatchObject({
      'fetch-depth': 0,
      filter: 'blob:none'
    })
    expect(workflow.env.ORCA_BACKGROUND_LAUNCH).toBe('1')
  })
})
