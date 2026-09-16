import { describe, expect, it } from 'vitest'
import { hostGrantPathCandidate } from './host-path-grant-policy'

describe('hostGrantPathCandidate', () => {
  it('accepts any absolute path on the host, not only the temp roots', () => {
    // Why these three: the provenance-backed grants confine themselves to /tmp. This one does not,
    // which is the whole point of D-301 — pin it so a later tightening is a deliberate change.
    for (const candidate of ['/etc/hosts', '/Users/me/workspace/forge/tmp/task', '/tmp/out.log']) {
      expect(hostGrantPathCandidate(candidate)).toBe(candidate)
    }
  })

  it('trims surrounding whitespace', () => {
    expect(hostGrantPathCandidate('  /var/log/system.log  ')).toBe('/var/log/system.log')
  })

  it('accepts a Windows absolute path', () => {
    expect(hostGrantPathCandidate('C:\\Users\\me\\notes.md')).toBe('C:\\Users\\me\\notes.md')
  })

  it('refuses anything that is not an absolute path', () => {
    for (const candidate of ['', '   ', 'relative/path.md', './x', '~/notes.md']) {
      expect(hostGrantPathCandidate(candidate)).toBeNull()
    }
  })

  it('refuses a path carrying control characters', () => {
    expect(hostGrantPathCandidate('/tmp/a\u0000b')).toBeNull()
    expect(hostGrantPathCandidate('/tmp/a\nb')).toBeNull()
  })

  it('refuses a non-string request', () => {
    for (const candidate of [undefined, null, 42, {}, ['/tmp/x']]) {
      expect(hostGrantPathCandidate(candidate)).toBeNull()
    }
  })
})
