import { acceptedAgentStatuses } from '@/store/slices/agent-status/status-ownership/accepted-agent-statuses'
import { describe, expect, it } from 'vitest'

import type { AiVaultSession } from '../../../../../../shared/ai-vault/contracts/ai-vault-types'
import type { AgentStatusEntry } from '../../../../../../shared/agent-status/contracts/agent-status-types'

import { makePaneKey } from '../../../../../../shared/workspace-layout/stable-pane-id'
import {
  type OriginalPaneState,
  findAiVaultSessionLiveState,
  findOriginalAiVaultSessionPane
} from './ai-vault-original-pane'
import {
  buildAiVaultOriginalPaneIndex,
  findOriginalAiVaultSessionPaneInIndex
} from './ai-vault-original-pane-index'

const LEAF_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_LEAF_ID = '22222222-2222-4222-8222-222222222222'

const baseSession: AiVaultSession = {
  id: 'codex:session-1',
  executionHostId: 'local',
  agent: 'codex',
  sessionId: 'session-1',
  title: 'Fix the pane focus',
  cwd: '/repo',
  branch: null,
  model: null,
  filePath: '/home/ada/.codex/session-1.jsonl',
  codexHome: null,
  createdAt: null,
  updatedAt: '2026-06-24T10:00:00.000Z',
  modifiedAt: '2026-06-24T10:00:00.000Z',
  messageCount: 2,
  totalTokens: 42,
  previewMessages: [],
  queuedMessageCount: 0,
  subagentTranscriptCount: 0,
  resumeCommand: "codex resume 'session-1'",
  subagent: null
}

function makeTab(id = 'tab-1', worktreeId = 'wt-1') {
  return {
    id,
    ptyId: null,
    worktreeId,
    title: 'Agent',
    customTitle: null,
    color: null,
    sortOrder: 0,
    createdAt: 1
  }
}

function makeLayout(leafId = LEAF_ID) {
  return {
    root: { type: 'leaf' as const, leafId },
    activeLeafId: leafId,
    expandedLeafId: null,
    ptyIdsByLeafId: { [leafId]: 'pty-1' }
  }
}

function makeState(overrides: Partial<OriginalPaneState> = {}): OriginalPaneState {
  return {
    agentStatusByPaneKey: acceptedAgentStatuses(Object.entries({})),
    agentConversationsByPaneKey: {},
    sleepingAgentSessionsByPaneKey: {},
    agentLaunchConfigByPaneKey: {},
    tabsByWorktree: { 'wt-1': [makeTab()] },
    terminalLayoutsByTabId: { 'tab-1': makeLayout() },
    ...overrides
  }
}

function makeEntry(overrides: Partial<AgentStatusEntry> = {}): AgentStatusEntry {
  const paneKey = makePaneKey('tab-1', LEAF_ID)
  return {
    state: 'working',
    prompt: 'continue',
    updatedAt: 1,
    stateStartedAt: 1,
    agentType: 'codex',
    paneKey,
    tabId: 'tab-1',
    worktreeId: 'wt-1',
    stateHistory: [],
    providerSession: { key: 'session_id', id: 'session-1' },
    ...overrides
  }
}

type LaunchConfigEntry = OriginalPaneState['agentLaunchConfigByPaneKey'][string]

function makeLaunchConfigEntry(
  identityOverrides: Partial<LaunchConfigEntry['identity']> = {}
): LaunchConfigEntry {
  return {
    launchConfig: { agentArgs: '', agentEnv: {} },
    registeredAt: 1,
    identity: {
      agentType: 'codex',
      tabId: 'tab-1',
      providerSession: { key: 'session_id', id: 'session-1' },
      ...identityOverrides
    }
  }
}

describe('findOriginalAiVaultSessionPane', () => {
  it('does not return a target when the original leaf is gone', () => {
    const entry = makeEntry()

    const target = findOriginalAiVaultSessionPane(
      makeState({
        agentStatusByPaneKey: acceptedAgentStatuses(Object.entries({ [entry.paneKey]: entry })),
        terminalLayoutsByTabId: { 'tab-1': makeLayout(OTHER_LEAF_ID) }
      }),
      baseSession
    )

    expect(target).toBeNull()
  })

  it('finds a hook-silent resumed pane through its launch-config identity', () => {
    const state = makeState({
      agentLaunchConfigByPaneKey: {
        [makePaneKey('tab-1', LEAF_ID)]: makeLaunchConfigEntry()
      }
    })

    expect(findOriginalAiVaultSessionPane(state, baseSession)).toEqual({
      paneKey: makePaneKey('tab-1', LEAF_ID),
      worktreeId: 'wt-1',
      tabId: 'tab-1',
      leafId: LEAF_ID
    })
    // Why: no hook has arrived, so the row must not claim a live turn state.
    expect(findAiVaultSessionLiveState(state, baseSession)).toBeNull()
  })

  it('prefers the hook-confirmed live pane over a launch-config match', () => {
    const entry = makeEntry()
    const state = makeState({
      agentStatusByPaneKey: acceptedAgentStatuses(Object.entries({ [entry.paneKey]: entry })),
      agentLaunchConfigByPaneKey: {
        [makePaneKey('tab-2', OTHER_LEAF_ID)]: makeLaunchConfigEntry({ tabId: 'tab-2' })
      },
      tabsByWorktree: { 'wt-1': [makeTab(), makeTab('tab-2')] },
      terminalLayoutsByTabId: { 'tab-1': makeLayout(), 'tab-2': makeLayout(OTHER_LEAF_ID) }
    })

    expect(findOriginalAiVaultSessionPane(state, baseSession)?.tabId).toBe('tab-1')
  })

  it('ignores launch configs without a provider identity or with a different agent', () => {
    const state = makeState({
      agentLaunchConfigByPaneKey: {
        [makePaneKey('tab-1', LEAF_ID)]: makeLaunchConfigEntry({ providerSession: undefined }),
        [makePaneKey('tab-2', OTHER_LEAF_ID)]: makeLaunchConfigEntry({
          agentType: 'claude',
          tabId: 'tab-2'
        })
      },
      tabsByWorktree: { 'wt-1': [makeTab(), makeTab('tab-2')] },
      terminalLayoutsByTabId: { 'tab-1': makeLayout(), 'tab-2': makeLayout(OTHER_LEAF_ID) }
    })

    expect(findOriginalAiVaultSessionPane(state, baseSession)).toBeNull()
  })

  it('drops a launch-config match when its pane is gone', () => {
    const state = makeState({
      agentLaunchConfigByPaneKey: {
        [makePaneKey('tab-9', LEAF_ID)]: makeLaunchConfigEntry({ tabId: 'tab-9' })
      }
    })

    expect(findOriginalAiVaultSessionPane(state, baseSession)).toBeNull()
  })

  it('matches a hook-silent resumed pane through the launch-config index like the direct scan', () => {
    const state = makeState({
      agentLaunchConfigByPaneKey: {
        [makePaneKey('tab-1', LEAF_ID)]: makeLaunchConfigEntry()
      }
    })

    const indexed = findOriginalAiVaultSessionPaneInIndex(
      buildAiVaultOriginalPaneIndex(state),
      baseSession
    )

    expect(indexed?.leafId).toBe(LEAF_ID)
    expect(indexed).toEqual(findOriginalAiVaultSessionPane(state, baseSession))
  })
})
