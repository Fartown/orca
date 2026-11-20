import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppState } from '@/store/types'
import { useAgentRowConversationName } from '../components/dashboard/rows/use-agent-row-conversation-name'
import type { DashboardAgentRow } from '../components/dashboard/rows/dashboard-agent-row'

// Fork (session-names): moved from use-agent-row-conversation-name.test.ts, which upstream #38364 removed.
const storeState = vi.hoisted(() => ({
  current: { settings: {}, tabsByWorktree: {} } as {
    settings: Record<string, unknown>
    tabsByWorktree: Record<string, unknown[]>
  }
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
