import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { assertReleaseRunner, signingCertificate } from './mac-signing.cjs'

const runner = {
  GITHUB_ACTIONS: 'true',
  RUNNER_ENVIRONMENT: 'github-hosted',
  RUNNER_TEMP: '/ci/temp',
  GITHUB_REPOSITORY: 'Fartown/orca',
  GITHUB_REF: 'refs/heads/fork/integration',
  GITHUB_EVENT_NAME: 'push'
}

describe('fixed macOS publisher signing', () => {
  it('allows only the hosted integration release runner to change signing trust', () => {
    expect(() => assertReleaseRunner(runner, 'darwin')).not.toThrow()
    for (const [key, value] of [
      ['GITHUB_ACTIONS', 'false'],
      ['RUNNER_ENVIRONMENT', 'self-hosted'],
      ['GITHUB_REPOSITORY', 'stablyai/orca'],
      ['GITHUB_REF', 'refs/heads/feat/integration-builds'],
      ['GITHUB_EVENT_NAME', 'pull_request'],
      ['RUNNER_TEMP', '']
    ]) {
      expect(() => assertReleaseRunner({ ...runner, [key]: value }, 'darwin')).toThrow()
    }
    expect(() => assertReleaseRunner(runner, 'linux')).toThrow()
  })

  it('derives the identity from a public certificate, not an unverified secret label', () => {
    const certificate = readFileSync(new URL('./expo-debug-certificate.pem', import.meta.url))
    const identity = signingCertificate(certificate)
    expect(identity.sha1).toMatch(/^[A-F0-9]{40}$/)
    expect(identity.sha256).toBe('fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c')
    expect(() => signingCertificate('invalid')).toThrow()
  })
})
