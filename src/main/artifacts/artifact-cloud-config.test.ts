import { describe, expect, it } from 'vitest'
import {
  allowsArtifactCloudAuthOverride,
  resolveArtifactCloudApiUrl
} from './artifact-cloud-config'

describe('resolveArtifactCloudApiUrl', () => {
  it('uses the first-party production origin by default', () => {
    expect(resolveArtifactCloudApiUrl(undefined, {})).toBe('https://share.onorca.dev')
  })

  it('allows loopback HTTP so a self-hosted backend needs no certificate', () => {
    expect(
      resolveArtifactCloudApiUrl(undefined, { ORCA_ARTIFACTS_API_URL: 'http://127.0.0.1:8787' })
    ).toBe('http://127.0.0.1:8787')
    expect(resolveArtifactCloudApiUrl('http://localhost:8787', {})).toBe('http://localhost:8787')
    expect(resolveArtifactCloudApiUrl('http://[::1]:8787', {})).toBe('http://[::1]:8787')
  })

  it('allows a private LAN backend over either scheme', () => {
    for (const origin of [
      'https://10.95.173.189:8787',
      'http://10.95.173.189:8787',
      'https://192.168.1.5:8787',
      'http://192.168.1.5:8787',
      'http://172.16.0.1:8787',
      'http://172.31.255.254:8787',
      'http://nas.local:8787'
    ]) {
      expect(resolveArtifactCloudApiUrl(origin, {})).toBe(origin)
    }
  })

  it('still refuses plaintext to a public host', () => {
    expect(() => resolveArtifactCloudApiUrl('http://share.onorca.dev', {})).toThrow(/HTTPS/)
    expect(() => resolveArtifactCloudApiUrl('http://example.com', {})).toThrow(/HTTPS/)
  })

  it('rejects origins that could receive an Orca access token', () => {
    expect(() => resolveArtifactCloudApiUrl('https://example.com', {})).toThrow(/onorca\.dev/)
    expect(() => resolveArtifactCloudApiUrl('https://share.onorca.dev/path', {})).toThrow(/origin/)
  })

  it('does not accept a public host that merely looks private', () => {
    // A prefix check would admit every one of these.
    for (const origin of [
      'https://10.0.0.1.evil.com',
      'https://192.168.1.5.evil.com',
      'https://172.16.0.1.attacker.net',
      'https://127.0.0.1.evil.com',
      'https://notlocal'
    ]) {
      expect(() => resolveArtifactCloudApiUrl(origin, {})).toThrow(/onorca\.dev/)
    }
  })

  it('does not treat public IPv4 just outside the RFC1918 blocks as private', () => {
    // 172.15 and 172.32 bracket the 172.16–172.31 block.
    for (const origin of [
      'https://172.15.0.1',
      'https://172.32.0.1',
      'https://11.0.0.1',
      'https://192.169.1.1'
    ]) {
      expect(() => resolveArtifactCloudApiUrl(origin, {})).toThrow(/onorca\.dev/)
    }
  })

  it('rejects a malformed octet before the host is ever classified', () => {
    expect(() => resolveArtifactCloudApiUrl('https://999.168.1.1', {})).toThrow(/Invalid URL/)
  })

  it('allows auth token overrides only in non-production development builds', () => {
    expect(allowsArtifactCloudAuthOverride({}, false)).toBe(true)
    expect(allowsArtifactCloudAuthOverride({ NODE_ENV: 'production' }, false)).toBe(false)
    expect(allowsArtifactCloudAuthOverride({}, true)).toBe(false)
  })
})
