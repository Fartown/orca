// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import type { ConnectPanePtySession } from './connect-pane-pty-session'
import { installSleepingRecordAccess } from './sleeping-record-access'
import { bindDeferredColdRestoreAndSnapshot } from './deferred-cold-restore-and-snapshot'
import type { ColdRestoreAgentResumeStartup } from './fresh-spawn-types'

const PANE_KEY = 'tab-lc:44444444-4444-4444-8444-444444444444'
const PROVIDER_SESSION = { key: 'session_id' as const, id: 'resumed-session-1' }

function makeSession(paneStartup: Record<string, unknown> | null): ConnectPanePtySession {
  return {
    cacheKey: PANE_KEY,
    deps: { tabId: 'tab-lc', worktreeId: 'wt-lc' },
    pane: { id: 1, leafId: '44444444-4444-4444-8444-444444444444' },
    paneStartup
  } as unknown as ConnectPanePtySession
}

afterEach(() => {
  useAppStore.getState().clearAgentLaunchConfig(PANE_KEY)
})

describe('resume identity in the launch-config registry', () => {
  it('records the resume provider session at startup registration', () => {
    const session = makeSession({
      command: 'codex resume resumed-session-1',
      launchConfig: { agentArgs: '', agentEnv: {} },
      launchAgent: 'codex',
      resumeProviderSession: PROVIDER_SESSION
    })

    installSleepingRecordAccess(session)

    expect(
      useAppStore.getState().agentLaunchConfigByPaneKey[PANE_KEY]?.identity.providerSession
    ).toEqual(PROVIDER_SESSION)
  })

  it('leaves the identity empty for a plain launch without a resume session', () => {
    const session = makeSession({
      command: 'codex',
      launchConfig: { agentArgs: '', agentEnv: {} },
      launchAgent: 'codex'
    })

    installSleepingRecordAccess(session)

    expect(
      useAppStore.getState().agentLaunchConfigByPaneKey[PANE_KEY]?.identity.providerSession
    ).toBeUndefined()
  })

  it('records the resume provider session on cold restore', () => {
    const session = makeSession(null)
    bindDeferredColdRestoreAndSnapshot(session)
    const startup = {
      command: 'codex resume resumed-session-1',
      agent: 'codex',
      resumeProviderSession: PROVIDER_SESSION,
      launchConfig: { agentArgs: '', agentEnv: {} },
      launchToken: 'token-1',
      useLiveEntry: false,
      hasSleepingRecord: false,
      sleepingRecordEntry: null
    } as unknown as ColdRestoreAgentResumeStartup

    expect(session.applyColdRestoreAgentResumeStartup(startup)).toBe(true)
    expect(
      useAppStore.getState().agentLaunchConfigByPaneKey[PANE_KEY]?.identity.providerSession
    ).toEqual(PROVIDER_SESSION)
  })
})
