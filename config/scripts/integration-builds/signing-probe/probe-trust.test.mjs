import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { changeCodeSigningTrust, isAbsentTrustRemoval } from '../mac-signing-trust.cjs'

const env = { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', RUNNER_TEMP: '/tmp' }

function fixture(failMutation = false) {
  const calls = []
  const original = '<plist>original authorization</plist>'
  const run = (executable, args, options = {}) => {
    calls.push({ executable, args, options })
    if (args.includes('add-trusted-cert') && failMutation) {
      throw new Error('Trust mutation failed')
    }
    return {
      status: 0,
      stderr: '',
      stdout:
        executable === '/usr/bin/plutil'
          ? '{"class":"user","rule":["authenticate-session-owner"]}'
          : original
    }
  }
  return { calls, run, original }
}

describe('ephemeral CI code-signing trust', () => {
  it('refuses local mutation before running any command', () => {
    const { calls, run } = fixture()
    expect(() => changeCodeSigningTrust({ run, env: {}, platform: 'darwin' })).toThrow(/ephemeral/)
    expect(calls).toHaveLength(0)
  })
  for (const failMutation of [false, true]) {
    it(`restores the full original policy after ${failMutation ? 'failed' : 'successful'} mutation`, () => {
      const directory = mkdtempSync(join(tmpdir(), 'orca-trust-unit-'))
      const { calls, run, original } = fixture(failMutation)
      const action = () =>
        changeCodeSigningTrust({
          certificate: '/fixture/public.pem',
          keychain: '/fixture/test.keychain',
          evidenceDirectory: directory,
          label: 'test',
          run,
          env,
          platform: 'darwin'
        })
      try {
        if (failMutation) {
          expect(action).toThrow(/Trust mutation failed/)
        } else {
          expect(action()).toEqual({ absent: false, restored: true })
        }
        const writes = calls.filter(({ args }) => args.includes('write'))
        expect(writes).toHaveLength(2)
        expect(writes[0].args).toEqual([
          '-n',
          '/usr/bin/security',
          'authorizationdb',
          'write',
          'com.apple.trust-settings.user',
          'allow'
        ])
        expect(writes[1].args).toEqual([
          '-n',
          '/usr/bin/security',
          'authorizationdb',
          'write',
          'com.apple.trust-settings.user'
        ])
        expect(writes[1].options.input).toBe(original)
        expect(calls.some(({ args }) => args.includes('remove'))).toBe(false)
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    })
  }
  it('only treats the exact missing trust record as idempotent removal', () => {
    expect(
      isAbsentTrustRemoval({
        status: 1,
        stderr:
          'SecTrustSettingsRemoveTrustSettings: The specified item could not be found in the keychain.'
      })
    ).toBe(true)
    expect(
      isAbsentTrustRemoval({
        status: 1,
        stderr: 'The authorization was denied since no user interaction was possible.'
      })
    ).toBe(false)
    expect(isAbsentTrustRemoval({ status: null, stderr: '', error: new Error('timeout') })).toBe(
      false
    )
  })
})
