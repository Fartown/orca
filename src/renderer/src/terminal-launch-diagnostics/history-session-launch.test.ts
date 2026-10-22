import { beforeEach, describe, expect, it, vi } from 'vitest'
import { launchAiVaultSessionInNewTab, launchDroppedAiVaultSession, launchRevealedAiVaultSession } from './history-session-launch'
import { currentTerminalLaunchOrigin, withTerminalLaunchOrigin } from './launch-origin'

const mocked = vi.hoisted(() => ({ launch: vi.fn(), state: {} }))
vi.mock('@/lib/launch-ai-vault-session', () => ({ launchAiVaultSessionInNewTab: mocked.launch }))
vi.mock('@/store', () => ({ useAppStore: { getState: () => mocked.state } }))
beforeEach(() => vi.clearAllMocks())

describe('history entry diagnostic decorators', () => {
  it.each([
    [launchAiVaultSessionInNewTab, 'ai-vault-resume'],
    [launchDroppedAiVaultSession, 'ai-vault-drop-resume'],
    [launchRevealedAiVaultSession, 'ai-vault-reveal-resume']
  ] as const)('keeps launch arguments and return identity while naming %s', (launch, origin) => {
    const args = { agent: 'claude' as const, worktreeId: 'wt', command: 'private-command' }
    const result = { tabId: null, runtimeLaunch: Promise.resolve({ status: 'created' }) }
    mocked.launch.mockImplementation(() => {
      expect(currentTerminalLaunchOrigin()).toBe(origin)
      return result
    })
    expect(launch(args)).toBe(result)
    expect(mocked.launch).toHaveBeenCalledExactlyOnceWith(args)
    expect(currentTerminalLaunchOrigin()).toBeUndefined()
  })

  it('restores an outer scope even when the original launcher throws', () => {
    const error = new Error('original failure')
    mocked.launch.mockImplementation(() => { throw error })
    withTerminalLaunchOrigin('queued-startup', () => {
      expect(() => launchAiVaultSessionInNewTab({ agent: 'claude', worktreeId: 'wt', command: '' })).toThrow(error)
      expect(currentTerminalLaunchOrigin()).toBe('queued-startup')
    })
    expect(currentTerminalLaunchOrigin()).toBeUndefined()
  })
})
