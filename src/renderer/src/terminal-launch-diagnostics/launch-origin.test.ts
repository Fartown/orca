import { afterEach, describe, expect, it, vi } from 'vitest'
import { recordTerminalLaunchOrigin } from './launch-origin'

afterEach(() => vi.unstubAllGlobals())

describe('terminal origin breadcrumbs', () => {
  it.each([
    'ai-vault-resume',
    'queued-startup',
    'paired-terminal-create',
    'automatic-sleeping-resume',
    'cold-restore-resume',
    'runtime-tab-create-request',
    'renderer-tab-created'
  ] as const)('records %s without contents', (origin) => {
    const recordBreadcrumb = vi.fn()
    vi.stubGlobal('window', { api: { crashReports: { recordBreadcrumb } } })
    recordTerminalLaunchOrigin(origin, {
      tabId: 'tab',
      command: 'private-command',
      env: { AUTH: 'private-credential' },
      prompt: 'private-prompt'
    })
    expect(recordBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'terminal_launch_origin',
        data: expect.objectContaining({ origin, diagnosticVersion: 1 })
      })
    )
    expect(JSON.stringify(recordBreadcrumb.mock.calls)).not.toMatch(/private-/)
  })

  it('does not throw when the bridge is missing, broken or evidence is malformed', () => {
    vi.stubGlobal('window', {})
    expect(() => recordTerminalLaunchOrigin('cold-restore-resume', {})).not.toThrow()
    vi.stubGlobal('window', {
      api: {
        crashReports: {
          recordBreadcrumb() {
            throw new Error('bridge failed')
          }
        }
      }
    })
    expect(() => recordTerminalLaunchOrigin('queued-startup', {})).not.toThrow()
    const malformed = {
      get tabId() {
        throw new Error('bad getter')
      }
    }
    expect(() => recordTerminalLaunchOrigin('renderer-tab-created', malformed)).not.toThrow()
  })
})
