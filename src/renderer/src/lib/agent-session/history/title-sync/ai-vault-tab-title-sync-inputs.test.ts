import type { AgentStatusEntry } from '../../../../../../shared/agent-status/contracts/agent-status-types'
import { acceptedAgentStatuses } from '@/store/slices/agent-status/status-ownership/accepted-agent-statuses'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppState } from '@/store/types'
import type { TerminalTab } from '../../../../../../shared/workspace-layout/terminal-tab-types'
import { createStore } from 'zustand/vanilla'
import { aiVaultTitleSyncInputsChanged } from './ai-vault-tab-title-sync-inputs'
import { startAiVaultTabTitleSync } from './ai-vault-tab-title-sync'

afterEach(() => vi.restoreAllMocks())

function makeState(count = 1): AppState {
  const live: Record<string, AgentStatusEntry> = {}
  const sleeping: AppState['sleepingAgentSessionsByPaneKey'] = {}
  const tabs: TerminalTab[] = []
  for (let index = 0; index < count * 2; index++) {
    const tab: TerminalTab = {
      id: `tab-${index}`,
      worktreeId: 'wt-title',
      ptyId: null,
      title: 'Agent',
      customTitle: null,
      color: null,
      sortOrder: index,
      createdAt: 1
    }
    const entry = {
      paneKey: `${tab.id}:00000000-0000-4000-8000-000000000001`,
      tabId: tab.id,
      worktreeId: tab.worktreeId,
      agentType: 'codex' as const,
      providerSession: { key: 'session_id' as const, id: `session-${index}` },
      state: 'done' as const,
      prompt: '',
      updatedAt: 1,
      stateStartedAt: 1,
      stateHistory: []
    }
    tabs.push(tab)
    if (index < count) {
      live[entry.paneKey] = entry
    } else {
      sleeping[entry.paneKey] = {
        ...entry,
        agent: 'codex',
        capturedAt: 1,
        origin: 'worktree-sleep'
      }
    }
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: this selector fixture supplies every field the title collector reads.
  return {
    agentStatusByPaneKey: acceptedAgentStatuses(Object.entries(live)),
    sleepingAgentSessionsByPaneKey: sleeping,
    tabsByWorktree: { 'wt-title': tabs },
    terminalLayoutsByTabId: {},
    activeWorktreeId: 'wt-title',
    activeWorkspaceExecutionHostId: 'local',
    worktreesByRepo: { fixture: [{ id: 'wt-title', repoId: 'fixture', hostId: 'local' }] },
    detectedWorktreesByRepo: {},
    folderWorkspaces: [],
    repos: [],
    settings: {}
  } as unknown as AppState
}

describe('AI Vault title subscription inputs', () => {
  // session-names: the session-name binding takes one inventory at start; live writes still enumerate nothing.
  it('does not enumerate the unchanged sleeping map during live status writes', () => {
    const state = makeState(500)
    let unchangedEnumerations = 0
    state.sleepingAgentSessionsByPaneKey = new Proxy(state.sleepingAgentSessionsByPaneKey, {
      ownKeys(target) {
        unchangedEnumerations++
        return Reflect.ownKeys(target)
      }
    })
    const store = createStore<AppState>(() => state)
    const scheduleReconcile = vi.fn(() => () => {})
    const statuses = new Map()
    const stop = startAiVaultTabTitleSync({
      getState: store.getState,
      subscribe: (listener) =>
        store.subscribe((next, previous) => listener(next, previous, statuses, statuses)),
      readStatuses: () => statuses,
      scheduleReconcile,
      resolveSessionTitles: vi.fn()
    })
    expect(unchangedEnumerations).toBe(1)
    unchangedEnumerations = 0
    try {
      const [paneKey, entry] = [...state.agentStatusByPaneKey.entries()][0]!
      for (let index = 0; index < 50; index++) {
        store.setState((current) => {
          const next = current.agentStatusByPaneKey.replace([
            [paneKey, { ...entry, updatedAt: index + 2 }]
          ])
          next.prepare()()
          return { agentStatusByPaneKey: next }
        })
      }
      expect(unchangedEnumerations).toBe(0)
      expect(scheduleReconcile).toHaveBeenCalledTimes(1)
    } finally {
      stop()
    }
  })

  it('ignores rank and settings changes but reports a conversation workspace moving host', () => {
    // No active selection, so the row's host decides ownership.
    const state = {
      ...makeState(200),
      activeWorktreeId: null,
      activeWorkspaceExecutionHostId: null
    }
    const row = state.worktreesByRepo.fixture[0]
    // A rank/unread patch replaces the row map without changing who owns any row.
    const ranked: AppState = {
      ...state,
      worktreesByRepo: { fixture: [{ ...row, sortOrder: 5, isUnread: true }] }
    }
    expect(aiVaultTitleSyncInputsChanged(ranked, state)).toBe(false)

    const settingsOnly: AppState = { ...ranked, settings: structuredClone(ranked.settings) }
    expect(aiVaultTitleSyncInputsChanged(settingsOnly, ranked)).toBe(false)
    expect(aiVaultTitleSyncInputsChanged({ ...settingsOnly }, settingsOnly)).toBe(false)

    const moved: AppState = {
      ...settingsOnly,
      worktreesByRepo: {
        fixture: [{ ...row, hostId: 'runtime:server-1', runtimeOwnerEnvironmentId: 'server-1' }]
      }
    }
    expect(aiVaultTitleSyncInputsChanged(moved, settingsOnly)).toBe(true)
  })
})
