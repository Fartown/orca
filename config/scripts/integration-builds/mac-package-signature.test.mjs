import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { X509Certificate } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { assertPublisherRequirement, verifyPackageSignature } from './mac-package-signature.mjs'

describe('macOS package publisher requirements', () => {
  const fingerprint = 'A'.repeat(40)
  const pinned = `identifier "com.stablyai.orca" and anchor H"${fingerprint}"`
  it('accepts the default same-certificate requirement without client trust', () => {
    expect(() => assertPublisherRequirement(pinned, fingerprint.toLowerCase())).not.toThrow()
    expect(() =>
      assertPublisherRequirement(
        `designated => ${pinned.replace('anchor', 'certificate root =')}`,
        fingerprint
      )
    ).not.toThrow()
  })
  it.each([
    'identifier "com.stablyai.orca"',
    `cdhash H"${fingerprint}"`,
    `${pinned} and anchor trusted`,
    `${pinned} or identifier "com.stablyai.orca"`,
    `identifier "com.stablyai.orca" and anchor H"${'B'.repeat(40)}"`
  ])('rejects an incompatible or unpinned requirement: %s', (requirement) => {
    expect(() => assertPublisherRequirement(requirement, fingerprint)).toThrow()
  })

  it.each(['none', 'signature', 'version', 'architecture'])(
    'checks actual package evidence and cleans extraction files: %s',
    (failure) => {
      const certificate = readFileSync(new URL('./expo-debug-certificate.pem', import.meta.url))
      const parsed = new X509Certificate(certificate)
      const sha1 = parsed.fingerprint.replaceAll(':', '')
      let extracted
      const execute = vi.fn((binary, args) => {
        if (args[0] === '--verify' && failure === 'signature') {
          throw new Error('Invalid code signature')
        }
        if (args[1] === '-r-') {
          return `identifier "com.stablyai.orca" and anchor H"${sha1}"`
        }
        if (args[1] === '--extract-certificates') {
          extracted = `${args[2]}0`
          writeFileSync(extracted, parsed.raw)
        }
        if (binary.endsWith('plutil')) {
          return failure === 'version' ? '1.0.0' : '1.0.1'
        }
        if (args[0] === '-p') {
          return failure === 'architecture' ? 'x64' : 'arm64'
        }
        return ''
      })
      const verify = () =>
        verifyPackageSignature(
          '/isolated/Orca.app',
          { certificate, arch: 'arm64', version: '1.0.1' },
          execute
        )
      if (failure === 'none') {
        expect(verify()).toMatchObject({ arch: 'arm64', version: '1.0.1' })
        expect(execute.mock.calls[0][1]).toEqual([
          '--verify',
          '--deep',
          '--strict',
          '/isolated/Orca.app'
        ])
      } else {
        expect(verify).toThrow()
      }
      if (extracted) {
        expect(existsSync(extracted)).toBe(false)
      }
    }
  )
})
