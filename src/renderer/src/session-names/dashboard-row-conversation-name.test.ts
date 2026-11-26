import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppState } from '@/store/types'
import { useAgentRowConversationName } from '../components/dashboard/rows/use-agent-row-conversation-name'
import type { DashboardAgentRow } from '../components/dashboard/rows/dashboard-agent-row'

// Fork (session-names): moved from use-agent-row-conversation-name.test.ts, which upstream #38364 removed.
type RowTestState = {
  settings: Record<string, unknown>
  terminalLayoutsByTabId?: AppState['terminalLayoutsByTabId']
  sleepingAgentSessionsByPaneKey?: AppState['sleepingAgentSessionsByPaneKey']
  agentConversationsByPaneKey?: AppState['agentConversationsByPaneKey']
  tabsByWorktree: Record<string, unknown[]>
}
const storeState = vi.hoisted((): { current: RowTestState } => ({
  current: { settings: {}, tabsByWorktree: {} }
}))
const canonicalTitleState = vi.hoisted(() => ({ current: undefined as string | undefined }))

// Run selectors directly against declared slices so conversation-name cases need no mounted component.
vi.mock('@/store/retained-views/app-state-view', () => ({
  useAppStateValue: (selector: (state: AppState) => unknown) =>
    selector({
      terminalLayoutsByTabId: {},
      runtimePaneTitlesByTabId: {},
      unifiedTabsByWorktree: {},
      ...storeState.current
    } as unknown as AppState)
}))
vi.mock('@/lib/workspace/ownership/worktree-runtime-owner', () => ({
  getExecutionHostIdForWorktree: () => 'local'
}))
vi.mock('@/lib/canonical-session-titles', () => ({
  useCanonicalSessionTitle: () => canonicalTitleState.current
}))
vi.mock('@/session-names/session-name-subscriptions', () => ({
  useSessionNameRecord: () => undefined
}))
vi.mock('@/runtime/native-chat/naming/structured-conversation-name', () => ({
  useStructuredChatTabNaming: () => ({ name: null, forkSourceId: null })
}))

function makeAgent(overrides: Partial<DashboardAgentRow> = {}): DashboardAgentRow {
  return {
    paneKey: 'tab-1:leaf-1',
    entry: { prompt: 'fix the sidebar' },
    tab: { id: 'tab-1', worktreeId: 'wt-1', customTitle: 'Patient sync spike', title: '' },
    agentType: 'claude',
    state: 'working',
    startedAt: 0,
    ...overrides
  } as DashboardAgentRow
}

beforeEach(() => {
  storeState.current = { settings: {}, tabsByWorktree: {} }
  canonicalTitleState.current = undefined
})

describe('aiVaultTitle slot ownership', () => {
  it('uses the row identity fallback when every semantic title is absent', () => {
    const tab = { id: 'tab-1', worktreeId: 'wt-1', customTitle: null, title: '⠋ ~/dev/orca' }
    storeState.current = { settings: {}, tabsByWorktree: { 'wt-1': [tab] } }
    const owner = makeAgent({
      tab,
      agentType: 'codex',
      entry: { prompt: '', providerSession: { key: 'session_id', id: 'session-a' } }
    } as Partial<DashboardAgentRow>)

    expect(useAgentRowConversationName(owner)).toBe('Codex session-')
  })

  it('shows the slot title only on the row whose session it names', () => {
    const tab = {
      id: 'tab-1',
      worktreeId: 'wt-1',
      customTitle: null,
      title: '',
      aiVaultTitle: { agent: 'codex', sessionId: 'session-a', title: 'Fix auth bug' }
    }
    storeState.current = { settings: {}, tabsByWorktree: { 'wt-1': [tab] } }
    const owner = makeAgent({
      tab,
      agentType: 'codex',
      entry: { prompt: '', providerSession: { key: 'session_id', id: 'session-a' } }
    } as Partial<DashboardAgentRow>)
    expect(useAgentRowConversationName(owner)).toBe('Fix auth bug')

    // A sibling pane in the same split tab runs a different session and must not wear the winner's name.
    const sibling = makeAgent({
      paneKey: 'tab-1:leaf-2',
      tab,
      agentType: 'claude',
      entry: { prompt: '', providerSession: { key: 'session_id', id: 'session-b' } }
    } as Partial<DashboardAgentRow>)
    expect(useAgentRowConversationName(sibling)).not.toBe('Fix auth bug')
  })

  it('keeps the name across occupancy loss only for the same pane and execution host', () => {
    const original = makeAgent()
    const { paneKey } = original
    const session = { key: 'session_id' as const, id: 'session-a' }
    const tab = {
      ...original.tab,
      customTitle: null,
      title: 'Terminal 1',
      aiVaultTitle: {
        agent: 'claude' as const,
        sessionId: session.id,
        title: 'Deployment review',
        providerName: {
          kind: 'named' as const,
          title: 'Deployment review',
          field: 'ai-title.aiTitle'
        }
      }
    }
    const entry = {
      ...original.entry,
      paneKey,
      agentType: 'claude' as const,
      worktreeId: tab.worktreeId,
      connectionId: null
    }
    const binding = {
      ...entry,
      agent: 'claude' as const,
      executionHostId: 'local' as const,
      providerSession: session
    }
    const row = { ...original, tab, entry }
    storeState.current = {
      settings: { tabAutoGenerateTitle: true },
      tabsByWorktree: { [tab.worktreeId]: [tab] },
      agentConversationsByPaneKey: { [paneKey]: binding }
    }
    expect(useAgentRowConversationName(row)).toBe('Deployment review')
    expect(
      useAgentRowConversationName({
        ...row,
        entry: { ...entry, providerSession: { ...session, id: 'replacement' } }
      })
    ).toBe('Claude replacem')
    storeState.current.agentConversationsByPaneKey = {
      [paneKey]: { ...binding, executionHostId: 'runtime:other' }
    }
    expect(useAgentRowConversationName(row)).toBeNull()
  })

  it('reads the sole pane from a live host publication or its identified restore record', () => {
    const original = makeAgent()
    const leaf = '11111111-1111-4111-8111-111111111111'
    const tab = {
      ...original.tab,
      customTitle: null,
      title: 'Terminal 1',
      sessionTitleFromHost: true as const,
      aiVaultTitle: {
        agent: 'claude' as const,
        sessionId: 'audit-id',
        title: 'Review deployment',
        providerName: {
          kind: 'named' as const,
          title: 'Review deployment',
          field: 'ai-title.aiTitle'
        }
      }
    }
    const paneKey = `${tab.id}:${leaf}`
    const entry = {
      ...original.entry,
      paneKey,
      worktreeId: tab.worktreeId,
      agentType: 'claude' as const,
      providerSession: undefined,
      connectionId: null
    }
    const row = { ...original, paneKey, agentType: 'claude' as const, entry, tab }
    storeState.current = {
      settings: {},
      tabsByWorktree: { [tab.worktreeId]: [tab] },
      terminalLayoutsByTabId: {
        [tab.id]: { root: { type: 'leaf', leafId: leaf }, activeLeafId: leaf, expandedLeafId: null }
      }
    }
    expect.soft(useAgentRowConversationName(row)).toBe('Review deployment')
    const cachedTab = { ...tab, sessionTitleFromHost: undefined }
    storeState.current.tabsByWorktree[tab.worktreeId] = [cachedTab]
    storeState.current.sleepingAgentSessionsByPaneKey = {
      [paneKey]: {
        paneKey,
        tabId: tab.id,
        worktreeId: tab.worktreeId,
        agent: 'claude',
        providerSession: { key: 'session_id', id: 'audit-id' },
        state: 'done',
        prompt: '',
        capturedAt: 1,
        updatedAt: 1,
        connectionId: null
      }
    }
    const restored = { ...row, tab: cachedTab, entry: { ...entry, restoredUnconfirmed: true } }
    expect.soft(useAgentRowConversationName(restored)).toBe('Review deployment')
    expect(
      useAgentRowConversationName({
        ...restored,
        entry: { ...restored.entry, sessionBoundary: true }
      })
    ).toBeNull()
    expect(useAgentRowConversationName({ ...row, tab: cachedTab })).toBeNull()
  })

  it('lets a manual name override the native Provider slot', () => {
    canonicalTitleState.current = 'Manual override name'
    const tab = {
      id: 'tab-1',
      worktreeId: 'wt-1',
      customTitle: null,
      title: '',
      aiVaultTitle: {
        agent: 'codex' as const,
        sessionId: 'session-a',
        title: 'Provider title',
        source: 'provider' as const
      }
    }
    storeState.current = { settings: {}, tabsByWorktree: { 'wt-1': [tab] } }
    const owner = makeAgent({
      tab,
      agentType: 'codex',
      entry: { prompt: '', providerSession: { key: 'session_id', id: 'session-a' } }
    } as Partial<DashboardAgentRow>)

    expect(useAgentRowConversationName(owner)).toBe('Manual override name')
  })
})
