import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  assertHostedMac,
  assertIsolatedMac,
  assertPinnedRequirement,
  probeOptions,
  CASES
} from './probe-policy.mjs'

describe('native signing probe boundaries', () => {
  it('refuses local and self-hosted trust changes', () => {
    expect(() => assertHostedMac({}, 'darwin')).toThrow(/ephemeral/)
    expect(() =>
      assertHostedMac(
        { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'self-hosted', RUNNER_TEMP: '/tmp' },
        'darwin'
      )
    ).toThrow()
    expect(() =>
      assertHostedMac(
        { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', RUNNER_TEMP: '/tmp' },
        'linux'
      )
    ).toThrow()
    expect(() =>
      assertHostedMac(
        { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', RUNNER_TEMP: '/tmp' },
        'darwin'
      )
    ).not.toThrow()
  })
  it('permits static validation without an output or runtime side effects', () => {
    expect(probeOptions(['--validate-only'])).toEqual({
      output: null,
      cases: CASES,
      validateOnly: true
    })
    expect(() => probeOptions([])).toThrow()
    expect(() => probeOptions(['--output'])).toThrow()
    expect(() => probeOptions(['--output', '.'], '/work')).toThrow()
    expect(() => probeOptions(['--output', '/'])).toThrow()
    expect(() => probeOptions(['--case', 'unknown', '--validate-only'])).toThrow()
  })
  it('requires the default designated requirement to pin the precise certificate', () => {
    const sha = 'a'.repeat(40)
    expect(() =>
      assertPinnedRequirement(`identifier "probe" and anchor H"${sha}"`, sha)
    ).not.toThrow()
    expect(() =>
      assertPinnedRequirement(`identifier "probe" and certificate root = H"${sha}"`, sha)
    ).not.toThrow()
    for (const requirement of [
      'identifier "probe"',
      `cdhash H"${sha}"`,
      'anchor apple',
      `anchor H"${'b'.repeat(40)}"`,
      `anchor H"${sha}" and anchor trusted`
    ]) {
      expect(() => assertPinnedRequirement(requirement, sha)).toThrow()
    }
  })
  it('never customizes requirements or reveals probe windows', () => {
    const bundles = readFileSync(new URL('./probe-bundles.mjs', import.meta.url), 'utf8')
    const runtime = readFileSync(new URL('./app-main.cjs', import.meta.url), 'utf8')
    expect(bundles).not.toContain("'--requirements'")
    expect(bundles).not.toContain("'--ignore-resources'")
    expect(runtime).toContain("app.setActivationPolicy('prohibited')")
    expect(runtime).toContain('show: false')
    expect(runtime).not.toMatch(/\.show\(|\.showInactive\(|\.focus\(|\.bringToFront\(/)
    expect(runtime).toContain('autoUpdater.quitAndInstall()')
  })
  it('uses PEM-only identities and destroys private material before runtime', () => {
    const identity = readFileSync(new URL('./probe-identities.mjs', import.meta.url), 'utf8')
    const runner = readFileSync(new URL('./run-probe.mjs', import.meta.url), 'utf8')
    expect(identity).not.toMatch(
      /add-trusted-cert|authorizationdb|create-keychain|mac-signing-trust/
    )
    expect(identity).toContain('trustNeverAdded: true')
    expect(runner.indexOf('signing.removeTrustBeforeRuntime()')).toBeLessThan(
      runner.indexOf('await runProbeCase(testCase)')
    )
    expect(runner.indexOf('signing.cleanup()')).toBeLessThan(
      runner.indexOf('await runProbeCase(testCase)')
    )
  })
  it('only allows local PEM-only probes below their evidence tree', () => {
    expect(() =>
      assertIsolatedMac(
        '/work/.docs/integration-updates-ui-validation/2026-09-12/selfsigned-ci/run',
        {},
        'darwin',
        '/work'
      )
    ).not.toThrow()
    expect(() => assertIsolatedMac('/Applications/Test.app', {}, 'darwin', '/work')).toThrow()
    expect(() =>
      assertIsolatedMac(
        '/work/.docs/integration-updates-ui-validation/2026-09-12/selfsigned-ci',
        {},
        'darwin',
        '/work'
      )
    ).toThrow()
  })
})
