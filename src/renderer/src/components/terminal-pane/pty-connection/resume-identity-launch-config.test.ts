// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import { findOriginalAiVaultSessionPane } from '@/components/right-sidebar/ai-vault-original-pane'
import type { AiVaultSession } from '../../../../../shared/ai-vault-types'
import type { ConnectPanePtySession } from './connect-pane-pty-session'
import { installSleepingRecordAccess } from './sleeping-record-access'
import { bindDeferredColdRestoreAndSnapshot } from './deferred-cold-restore-and-snapshot'
import type { ColdRestoreAgentResumeStartup } from './fresh-spawn-types'

const LEAF_ID = '44444444-4444-4444-8444-444444444444'
const PANE_KEY = `tab-lc:${LEAF_ID}`
const PROVIDER_SESSION = { key: 'session_id' as const, id: 'resumed-session-1' }

/** The AI Vault row for the very session the pane resumed. */
const VAULT_SESSION = {
  id: 'codex:resumed-session-1',
  executionHostId: 'local',
  agent: 'codex',
  sessionId: 'resumed-session-1',
  title: 'Resumed work',
  cwd: '/repo',
  branch: null,
  model: null,
  filePath: '/home/ada/.codex/resumed-session-1.jsonl',
  codexHome: null,
  createdAt: null,
  updatedAt: '2026-08-31T10:00:00.000Z',
  modifiedAt: '2026-08-31T10:00:00.000Z',
  messageCount: 2,
  totalTokens: 10,
  previewMessages: [],
  queuedMessageCount: 0,
  subagentTranscriptCount: 0,
  resumeCommand: "codex resume 'resumed-session-1'",
  subagent: null
} as unknown as AiVaultSession

/** Give the resumed pane a real tab and layout so pane resolution can succeed. */
function seedPaneSurface(): void {
  useAppStore.setState({
    tabsByWorktree: {
      'wt-lc': [
        {
          id: 'tab-lc',
          ptyId: null,
          worktreeId: 'wt-lc',
          title: 'Agent',
          customTitle: null,
          color: null,
          sortOrder: 0,
          createdAt: 1
        }
      ]
    },
    terminalLayoutsByTabId: {
      'tab-lc': {
        root: { type: 'leaf', leafId: LEAF_ID },
        activeLeafId: LEAF_ID,
        expandedLeafId: null,
        ptyIdsByLeafId: { [LEAF_ID]: 'pty-lc' }
      }
    }
  } as never)
}

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
  useAppStore.setState({ tabsByWorktree: {}, terminalLayoutsByTabId: {} } as never)
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

  it('lets the original-pane finder locate a hook-silent resumed pane end to end', () => {
    seedPaneSurface()
    const session = makeSession({
      command: "codex resume 'resumed-session-1'",
      launchConfig: { agentArgs: '', agentEnv: {} },
      launchAgent: 'codex',
      resumeProviderSession: PROVIDER_SESSION
    })

    installSleepingRecordAccess(session)

    // The accident's exact shape: the resumed agent is idle, so no hook and no
    // sleeping record name this session anywhere.
    const state = useAppStore.getState()
    expect(
      Object.values(state.agentStatusByPaneKey).some(
        (entry) => entry?.providerSession?.id === PROVIDER_SESSION.id
      )
    ).toBe(false)
    expect(
      Object.values(state.sleepingAgentSessionsByPaneKey).some(
        (record) => record?.providerSession?.id === PROVIDER_SESSION.id
      )
    ).toBe(false)

    expect(findOriginalAiVaultSessionPane(state, VAULT_SESSION)).toEqual({
      paneKey: PANE_KEY,
      worktreeId: 'wt-lc',
      tabId: 'tab-lc',
      leafId: LEAF_ID
    })
  })

  it('still reports no original pane for a plain launch that never resumed', () => {
    seedPaneSurface()
    const session = makeSession({
      command: 'codex',
      launchConfig: { agentArgs: '', agentEnv: {} },
      launchAgent: 'codex'
    })

    installSleepingRecordAccess(session)

    expect(findOriginalAiVaultSessionPane(useAppStore.getState(), VAULT_SESSION)).toBeNull()
  })
})
