import { describe, expect, it } from 'vitest'
import { assertLinuxServiceReplacement } from './verify-linux-service.mjs'

function snapshots() {
  const expectedVersion = '1.4.214-preview.55'
  const before = {
    terminal_daemon_retained: true,
    tabs: [
      {
        id: 'tab-1',
        ptyId: 'pty-1',
        incarnationId: 'incarnation-1',
        providerSessionId: 'session-1'
      }
    ]
  }
  const after = {
    ...structuredClone(before),
    ActiveState: 'active',
    cli_version: expectedVersion,
    web_http_status: 200,
    updater: {
      appVersion: expectedVersion,
      support: { installMode: 'supervised-headless-serve', automatic: true, reason: 'available' }
    }
  }
  return { expectedVersion, before, after }
}

describe('Linux replacement service acceptance', () => {
  it('accepts initialized support and retained sessions regardless of the obsolete field', () => {
    const fixture = snapshots()
    fixture.after.updater.unsupportedReason = 'obsolete'
    expect(() => assertLinuxServiceReplacement(fixture)).not.toThrow()
  })

  it.each([
    { installMode: 'interactive', automatic: false, reason: 'updater-unavailable' },
    {
      installMode: 'unsupported-headless-serve',
      automatic: false,
      reason: 'manual-service-update-required'
    },
    { installMode: 'interactive', automatic: true, reason: 'available' }
  ])('rejects unsupported or incomplete updater initialization: %j', (support) => {
    const fixture = snapshots()
    fixture.after.updater.support = support
    expect(() => assertLinuxServiceReplacement(fixture)).toThrow('supervised automatic updates')
  })

  it('rejects a recreated terminal even when its tab, PTY and provider IDs are unchanged', () => {
    const fixture = snapshots()
    fixture.after.tabs[0].incarnationId = 'replacement-incarnation'
    expect(() => assertLinuxServiceReplacement(fixture)).toThrow()
  })

  it('requires live PTY identity evidence in both snapshots', () => {
    const fixture = snapshots()
    delete fixture.before.tabs[0].incarnationId
    delete fixture.after.tabs[0].incarnationId
    expect(() => assertLinuxServiceReplacement(fixture)).toThrow()
  })

  it('accepts retained tabs without a PTY', () => {
    const fixture = snapshots()
    fixture.before.tabs.push({ id: 'editor-1' })
    fixture.after.tabs.push({ id: 'editor-1' })
    expect(() => assertLinuxServiceReplacement(fixture)).not.toThrow()
  })

  it.each([
    'runtime-version',
    'cli-version',
    'http',
    'service',
    'daemon',
    'tab',
    'pty',
    'provider',
    'duplicate',
    'missing-snapshot'
  ])('rejects a failed replacement invariant: %s', (kind) => {
    const fixture = snapshots()
    if (kind === 'runtime-version') {
      fixture.after.updater.appVersion = 'old'
    }
    if (kind === 'cli-version') {
      fixture.after.cli_version = 'old'
    }
    if (kind === 'http') {
      fixture.after.web_http_status = 500
    }
    if (kind === 'service') {
      fixture.after.ActiveState = 'inactive'
    }
    if (kind === 'daemon') {
      fixture.after.terminal_daemon_retained = false
    }
    if (kind === 'tab') {
      fixture.after.tabs = []
    }
    if (kind === 'pty') {
      fixture.after.tabs[0].ptyId = 'replacement-pty'
    }
    if (kind === 'provider') {
      fixture.after.tabs[0].providerSessionId = null
    }
    if (kind === 'duplicate') {
      fixture.after.tabs.push(fixture.after.tabs[0])
    }
    if (kind === 'missing-snapshot') {
      delete fixture.before.tabs
    }
    expect(() => assertLinuxServiceReplacement(fixture)).toThrow()
  })
})
