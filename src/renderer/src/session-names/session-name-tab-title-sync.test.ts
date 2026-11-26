import { describe, expect, it, vi } from 'vitest'
import type {
  AiVaultSessionTitlesArgs,
  AiVaultSessionTitlesResult
} from '../../../shared/ai-vault/contracts/ai-vault-session-title'
import type { AgentStatusEntry } from '../../../shared/agent-status/contracts/agent-status-types'
import type { TerminalTab } from '../../../shared/workspace-layout/terminal-tab-types'
import { acceptedAgentStatuses } from '@/store/slices/agent-status/status-ownership/accepted-agent-statuses'
import { aiVaultTitleSyncInputsChanged } from '../lib/agent-session/history/title-sync/ai-vault-tab-title-sync-inputs'
import { startAiVaultTabTitleSync } from '../lib/agent-session/history/title-sync/ai-vault-tab-title-sync'
import { createSessionNameStore } from './session-name-store'
import type { AppState } from '@/store/types'
import { registerRuntimeTerminalTab } from '@/runtime/hosted-terminals/mounted-surfaces/mounted-terminal-tab-registry'
import type { PaneManager } from '@/lib/pane-manager/pane-manager'

// Ported from the fork's src/renderer/src/lib/ai-vault-tab-title-sync.test.ts after upstream removed that suite (#42593).

function terminalTab(worktreeId: string, aiVaultTitle?: TerminalTab['aiVaultTitle']): TerminalTab {
  return {
    id: 'tab-1',
    ptyId: null,
    worktreeId,
    title: '⠋ albacore',
    aiVaultTitle,
    customTitle: null,
    color: null,
    sortOrder: 0,
    createdAt: 1
  }
}

function titleResult(agent: 'claude' | 'codex', title: string): AiVaultSessionTitlesResult {
  return {
    titles: [
      {
        agent,
        sessionId: `${agent}-session`,
        title,
        providerName: { kind: 'named', title, field: 'test.nativeName' }
      }
    ]
  }
}

type TitleSyncListener = Parameters<Parameters<typeof startAiVaultTabTitleSync>[0]['subscribe']>[0]

function makeState(args: {
  agent?: 'claude' | 'codex'
  aiVaultTitle?: TerminalTab['aiVaultTitle']
  executionHostId: 'local' | 'ssh:dev-box' | 'runtime:server-1'
  split?: boolean
  sleeping?: boolean
  worktreeId: string
}) {
  const leafId = '11111111-1111-4111-8111-111111111111'
  const paneKey = `tab-1:${leafId}`
  const agent = args.agent ?? 'codex'
  const tab = terminalTab(args.worktreeId, args.aiVaultTitle)
  const listeners = new Set<TitleSyncListener>()
  const providerSession = {
    key: 'session_id' as const,
    id: `${agent}-session`,
    transcriptPath: `/sessions/${agent}.jsonl`
  }
  const statusEntry: AgentStatusEntry = {
    state: 'done',
    prompt: '',
    updatedAt: 1,
    stateStartedAt: 1,
    agentType: agent,
    paneKey,
    tabId: 'tab-1',
    worktreeId: args.worktreeId,
    providerSession,
    stateHistory: []
  }
  const emit = (previous: AppState): void => {
    for (const listener of listeners) {
      listener(
        state,
        previous,
        state.runtimeStatusByEnvironmentId,
        previous.runtimeStatusByEnvironmentId
      )
    }
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: this fixture supplies every field the title sync reads.
  let state = {
    activeWorktreeId: args.worktreeId,
    activeWorkspaceExecutionHostId: args.executionHostId,
    agentStatusByPaneKey: acceptedAgentStatuses(args.sleeping ? [] : [[paneKey, statusEntry]]),
    sleepingAgentSessionsByPaneKey: args.sleeping
      ? {
          [paneKey]: {
            paneKey,
            tabId: 'tab-1',
            worktreeId: args.worktreeId,
            agent,
            providerSession,
            prompt: '',
            state: 'done',
            capturedAt: 1,
            updatedAt: 1,
            origin: 'worktree-sleep'
          }
        }
      : {},
    tabsByWorktree: { [args.worktreeId]: [tab] },
    terminalLayoutsByTabId: {
      'tab-1': {
        root: { type: 'leaf', leafId },
        activeLeafId: leafId,
        expandedLeafId: null
      }
    },
    worktreesByRepo: {
      fixture: [{ id: args.worktreeId, repoId: 'fixture', hostId: args.executionHostId }]
    },
    detectedWorktreesByRepo: {},
    folderWorkspaces: [],
    repos: [],
    settings: {},
    runtimeStatusByEnvironmentId: new Map(),
    setAiVaultTabTitle: (tabId: string, aiVaultTitle: TerminalTab['aiVaultTitle'] | null) => {
      const previous = state
      state = {
        ...state,
        tabsByWorktree: {
          [args.worktreeId]: state.tabsByWorktree[args.worktreeId].map((entry: TerminalTab) =>
            entry.id === tabId ? { ...entry, aiVaultTitle } : entry
          )
        }
      }
      emit(previous)
    }
  } as unknown as AppState
  if (args.split) {
    const sibling = '22222222-2222-4222-8222-222222222222'
    const siblingKey = `tab-1:${sibling}`
    state.terminalLayoutsByTabId['tab-1'].root = {
      type: 'split',
      direction: 'horizontal',
      ratio: 0.5,
      first: { type: 'leaf', leafId },
      second: { type: 'leaf', leafId: sibling }
    }
    state.agentStatusByPaneKey = acceptedAgentStatuses([
      [paneKey, statusEntry],
      [
        siblingKey,
        {
          ...statusEntry,
          paneKey: siblingKey,
          providerSession: { ...providerSession, id: 'sibling' }
        }
      ]
    ])
  }
  return {
    getState: () => state,
    publishPaneTitle: (title: string, paneId = 1) => {
      const previous = state
      state = { ...state, runtimePaneTitlesByTabId: { 'tab-1': { [paneId]: title } } }
      emit(previous)
    },
    setProviderSessionId: (sessionId: string) => {
      const previous = state
      state = {
        ...state,
        agentStatusByPaneKey: acceptedAgentStatuses(
          [...state.agentStatusByPaneKey.entries()].map(([paneKey, entry]) => [
            paneKey,
            entry.providerSession
              ? { ...entry, providerSession: { ...entry.providerSession, id: sessionId } }
              : entry
          ])
        )
      }
      emit(previous)
    },
    readStatuses: () => state.runtimeStatusByEnvironmentId,
    subscribe: (listener: TitleSyncListener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}

function storedSlot(store: ReturnType<typeof makeState>): TerminalTab['aiVaultTitle'] {
  return store.getState().tabsByWorktree['worktree-1'][0].aiVaultTitle
}

describe('session-name tab title sync', () => {
  it('rereads the native name on an owning pane title change while the previous name is cached', async () => {
    const worktreeId = 'worktree-1'
    const store = makeState({ agent: 'claude', executionHostId: 'local', worktreeId })
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the title listener uses only the mounted leaf lookup.
    const manager = {
      getLeafId: () => '11111111-1111-4111-8111-111111111111'
    } as unknown as PaneManager
    const unregister = registerRuntimeTerminalTab({
      worktreeId,
      tabId: 'tab-1',
      getManager: () => manager,
      getContainer: () => null,
      getPtyIdForPane: () => null,
      getTabWideAgentHintLeafId: () => null
    })
    let native = 'First conversation'
    const names = createSessionNameStore(async () => titleResult('claude', native))
    const stop = startAiVaultTabTitleSync({
      ...store,
      resolveSessionTitles: names.resolveSessionTitles,
      invalidateSessionNames: (requests) =>
        names.invalidate(
          requests.map((request) => ({
            agent: request.agent,
            executionHostId: request.executionHostId,
            sessionId: request.providerSession.id
          }))
        )
    })
    try {
      await vi.waitFor(() => expect(storedSlot(store)?.title).toBe('First conversation'))
      native = 'Renamed in Claude'
      store.publishPaneTitle('✳ Renamed in Claude')
      await vi.waitFor(() =>
        expect(storedSlot(store)?.providerName).toMatchObject({ title: 'Renamed in Claude' })
      )
    } finally {
      stop()
      names.reset()
      unregister()
    }
  })

  it.each(['watched', 'cached'] as const)(
    'refreshes the %s background name without renaming the focused tab',
    async (consumer) => {
      const worktreeId = 'worktree-1'
      const store = makeState({
        agent: 'claude',
        executionHostId: 'local',
        worktreeId,
        split: true
      })
      const leaves = [
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222'
      ]
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the title listener only reads pane identities.
      const manager = { getLeafId: (id: number) => leaves[id - 1] } as unknown as PaneManager
      const unregister = registerRuntimeTerminalTab({
        worktreeId,
        tabId: 'tab-1',
        getManager: () => manager,
        getContainer: () => null,
        getPtyIdForPane: () => null,
        getTabWideAgentHintLeafId: () => null
      })
      let siblingName = 'Original sibling'
      const names = createSessionNameStore(async ({ requests }) => ({
        titles: requests.map(({ sessionId }) => {
          const title = sessionId === 'sibling' ? siblingName : 'Focused conversation'
          return { ...titleResult('claude', title).titles[0]!, sessionId }
        })
      }))
      const requests = [
        { executionHostId: 'local', agent: 'claude', sessionId: 'sibling' }
      ] as const
      const watched = consumer === 'watched' ? names.watch(requests) : undefined
      await names.read(requests)
      const stop = startAiVaultTabTitleSync({
        ...store,
        resolveSessionTitles: names.resolveSessionTitles,
        invalidateSessionNames: (requests, refreshObserved) =>
          names.invalidate(
            requests.map((request) => ({
              executionHostId: request.executionHostId,
              agent: request.agent,
              sessionId: request.providerSession.id
            })),
            refreshObserved
          )
      })
      const sibling = () =>
        [...names.getSnapshot().values()].find((row) => row.sessionId === 'sibling')?.title
      try {
        await vi.waitFor(() => expect(storedSlot(store)?.title).toBe('Focused conversation'))
        expect(sibling()).toBe('Original sibling')
        siblingName = 'Renamed background conversation'
        store.publishPaneTitle('✳ Renamed background conversation', 2)
        await vi.waitFor(() => expect(sibling()).toBe('Renamed background conversation'))
        expect(storedSlot(store)?.title).toBe('Focused conversation')
      } finally {
        stop()
        watched?.unsubscribe()
        names.reset()
        unregister()
      }
    }
  )

  it('projects a shared-cache rename into a sleeping tab without a request feedback loop', async () => {
    const store = makeState({
      executionHostId: 'ssh:dev-box',
      worktreeId: 'worktree-1',
      sleeping: true
    })
    const resolve = vi.fn(async () => titleResult('codex', 'First native'))
    const names = createSessionNameStore(resolve)
    const stop = startAiVaultTabTitleSync({
      ...store,
      resolveSessionTitles: names.resolveSessionTitles,
      subscribeSessionNames: names.subscribe
    })
    await vi.waitFor(() => expect(storedSlot(store)?.title).toBe('First native'))
    names.publish('ssh:dev-box', titleResult('codex', 'Renamed elsewhere'))
    await vi.waitFor(() => expect(storedSlot(store)?.title).toBe('Renamed elsewhere'))
    expect(resolve).toHaveBeenCalledTimes(1)
    stop()
    names.reset()
  })

  it('treats a source-only slot transition as a sync input change', () => {
    const store = makeState({
      executionHostId: 'ssh:dev-box',
      worktreeId: 'worktree-1',
      aiVaultTitle: {
        agent: 'codex',
        sessionId: 'codex-session',
        title: 'Same visible title',
        source: 'provider'
      }
    })
    const previous = store.getState()
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: only the stored slot differs.
    const current = {
      ...previous,
      tabsByWorktree: {
        'worktree-1': [
          {
            ...previous.tabsByWorktree['worktree-1'][0],
            aiVaultTitle: {
              agent: 'codex' as const,
              sessionId: 'codex-session',
              title: 'Same visible title',
              source: 'conversation-override' as const
            }
          }
        ]
      }
    } as AppState

    expect(aiVaultTitleSyncInputsChanged(current, previous)).toBe(true)
  })

  it.each(['claude', 'codex'] as const)(
    'projects the canonical %s AI Vault session title with its evidence',
    async (agent) => {
      const store = makeState({ agent, executionHostId: 'ssh:dev-box', worktreeId: 'worktree-1' })
      const resolveSessionTitles = vi.fn(async () => titleResult(agent, `${agent} conversation`))
      const stop = startAiVaultTabTitleSync({ ...store, resolveSessionTitles })

      await vi.waitFor(() =>
        expect(storedSlot(store)).toEqual({
          agent,
          sessionId: `${agent}-session`,
          title: `${agent} conversation`,
          kind: 'named',
          providerName: { kind: 'named', title: `${agent} conversation`, field: 'test.nativeName' },
          manualTitle: null,
          source: 'provider'
        })
      )
      expect(resolveSessionTitles).toHaveBeenCalledWith({
        executionHostScope: 'ssh:dev-box',
        requests: [
          { agent, sessionId: `${agent}-session`, transcriptPath: `/sessions/${agent}.jsonl` }
        ]
      })
      stop()
    }
  )

  it('does not retain another session name after an admitted identity changes without a title', async () => {
    const store = makeState({ executionHostId: 'ssh:dev-box', worktreeId: 'worktree-1' })
    // Internal calls are rejected upstream; this store transition is an admitted successor.
    const resolveSessionTitles = vi.fn(async () => titleResult('codex', 'Original conversation'))
    const stop = startAiVaultTabTitleSync({ ...store, resolveSessionTitles })

    await vi.waitFor(() => expect(resolveSessionTitles).toHaveBeenCalledTimes(1))
    store.setProviderSessionId('codex-session-2')

    await vi.waitFor(() => expect(resolveSessionTitles).toHaveBeenCalledTimes(2))
    expect(storedSlot(store)).toMatchObject({ sessionId: 'codex-session-2', manualTitle: null })
    expect(storedSlot(store)?.title).not.toBe('Original conversation')
    stop()
  })

  it('does not land an old response after the admitted pane identity has changed', async () => {
    const store = makeState({ executionHostId: 'ssh:dev-box', worktreeId: 'worktree-1' })
    // Child observations must be rejected by ownership admission, before this state changes.
    const resolveSessionTitles = vi.fn(async () => {
      store.setProviderSessionId('codex-new-session')
      return titleResult('codex', 'Real conversation')
    })
    const stop = startAiVaultTabTitleSync({ ...store, resolveSessionTitles })

    await vi.waitFor(() => expect(resolveSessionTitles).toHaveBeenCalledTimes(2))
    expect(storedSlot(store)).toMatchObject({ sessionId: 'codex-new-session' })
    expect(storedSlot(store)?.title).not.toBe('Real conversation')
    stop()
  })

  it('replaces the name once the changed provider identity resolves', async () => {
    const store = makeState({ executionHostId: 'ssh:dev-box', worktreeId: 'worktree-1' })
    const resolveSessionTitles = vi.fn(async (args: AiVaultSessionTitlesArgs) => ({
      titles: args.requests.map((request) => ({
        agent: request.agent,
        sessionId: request.sessionId,
        title:
          request.sessionId === 'codex-session-2' ? 'Next conversation' : 'Original conversation'
      }))
    }))
    const stop = startAiVaultTabTitleSync({ ...store, resolveSessionTitles })

    await vi.waitFor(() => expect(storedSlot(store)?.title).toBe('Original conversation'))
    store.setProviderSessionId('codex-session-2')

    await vi.waitFor(() =>
      expect(storedSlot(store)).toMatchObject({
        sessionId: 'codex-session-2',
        title: 'Next conversation'
      })
    )
    stop()
  })
})

describe('canonical conversation title projection', () => {
  it('projects a manual-name notification without waiting for the idle file-scan scheduler', () => {
    const store = makeState({
      executionHostId: 'ssh:dev-box',
      worktreeId: 'worktree-1',
      aiVaultTitle: {
        agent: 'codex',
        sessionId: 'codex-session',
        title: 'Codex codex-se',
        providerName: { kind: 'absent' },
        manualTitle: null,
        source: 'provider'
      }
    })
    let canonical: string | null = null
    let notifyCanonical!: () => void
    const resolveSessionTitles = vi.fn(async () => ({ titles: [] }))
    const stop = startAiVaultTabTitleSync({
      ...store,
      resolveSessionTitles,
      getCanonicalTitle: () => canonical,
      subscribeCanonicalTitles: (listener) => {
        notifyCanonical = listener
        return () => undefined
      },
      scheduleReconcile: () => () => undefined
    })
    try {
      canonical = 'Formal manual name, not the container alias'
      notifyCanonical()
      expect(storedSlot(store)).toMatchObject({
        title: canonical,
        manualTitle: canonical,
        source: 'conversation-override'
      })
      expect(resolveSessionTitles).not.toHaveBeenCalled()
    } finally {
      stop()
    }
  })

  it('revalidates a persisted override through the native resolver after restart', async () => {
    const store = makeState({
      executionHostId: 'ssh:dev-box',
      worktreeId: 'worktree-1',
      sleeping: true,
      aiVaultTitle: {
        agent: 'codex',
        sessionId: 'codex-session',
        title: 'Stale override',
        source: 'conversation-override'
      }
    })
    const resolveSessionTitles = vi.fn(async () => titleResult('codex', 'Provider after Clear'))
    const stop = startAiVaultTabTitleSync({ ...store, resolveSessionTitles })

    await vi.waitFor(() =>
      expect(storedSlot(store)).toEqual({
        agent: 'codex',
        sessionId: 'codex-session',
        title: 'Provider after Clear',
        kind: 'named',
        providerName: { kind: 'named', title: 'Provider after Clear', field: 'test.nativeName' },
        manualTitle: null,
        source: 'provider'
      })
    )
    expect(resolveSessionTitles).toHaveBeenCalledOnce()
    stop()
  })

  it('applies a canonical change to a sleeping slot without rescanning', async () => {
    const store = makeState({
      executionHostId: 'ssh:dev-box',
      worktreeId: 'worktree-1',
      sleeping: true,
      aiVaultTitle: {
        agent: 'codex',
        sessionId: 'codex-session',
        title: 'Old scanner name',
        providerName: { kind: 'named', title: 'Old scanner name', field: 'test.nativeName' },
        source: 'provider'
      }
    })
    let canonical: string | null = null
    let notifyCanonical: (() => void) | null = null
    const resolveSessionTitles = vi.fn(async () => titleResult('codex', 'Scanner name'))
    const stop = startAiVaultTabTitleSync({
      ...store,
      resolveSessionTitles,
      getCanonicalTitle: () => canonical,
      subscribeCanonicalTitles: (listener) => {
        notifyCanonical = listener
        return () => undefined
      }
    })
    // The slot already holds a matching non-empty title, so the sleeping candidate is excluded from scanning entirely.
    await vi.waitFor(() => expect(resolveSessionTitles).not.toHaveBeenCalled())

    canonical = 'Renamed by user'
    notifyCanonical!()
    await vi.waitFor(() =>
      expect(storedSlot(store)).toEqual({
        agent: 'codex',
        sessionId: 'codex-session',
        title: 'Renamed by user',
        kind: 'named',
        manualTitle: 'Renamed by user',
        providerName: { kind: 'named', title: 'Old scanner name', field: 'test.nativeName' },
        source: 'conversation-override'
      })
    )
    expect(resolveSessionTitles).not.toHaveBeenCalled()
    stop()
  })

  it('shows the canonical manual name while keeping the fresh native name as evidence', async () => {
    const store = makeState({ executionHostId: 'ssh:dev-box', worktreeId: 'worktree-1' })
    const stop = startAiVaultTabTitleSync({
      ...store,
      resolveSessionTitles: async () => titleResult('codex', 'Scanner value'),
      getCanonicalTitle: () => 'Canonical value',
      subscribeCanonicalTitles: () => () => undefined
    })
    await vi.waitFor(() =>
      expect(storedSlot(store)).toEqual({
        agent: 'codex',
        sessionId: 'codex-session',
        title: 'Canonical value',
        kind: 'named',
        manualTitle: 'Canonical value',
        providerName: { kind: 'named', title: 'Scanner value', field: 'test.nativeName' },
        source: 'conversation-override'
      })
    )
    stop()
  })

  it('clears a projected canonical from the slot after the conversation is forgotten', async () => {
    const store = makeState({
      executionHostId: 'ssh:dev-box',
      worktreeId: 'worktree-1',
      sleeping: true
    })
    let canonical: string | null = 'Forget me'
    let notifyCanonical: (() => void) | null = null
    const resolveSessionTitles = vi.fn(async () => ({
      titles: [
        {
          agent: 'codex' as const,
          sessionId: 'codex-session',
          title: 'Scanner value',
          providerName: { kind: 'absent' as const },
          generatedTitle: 'Scanner value'
        }
      ]
    }))
    const stop = startAiVaultTabTitleSync({
      ...store,
      resolveSessionTitles,
      getCanonicalTitle: () => canonical,
      subscribeCanonicalTitles: (listener) => {
        notifyCanonical = listener
        return () => undefined
      }
    })
    await vi.waitFor(() => expect(storedSlot(store)?.title).toBe('Forget me'))

    canonical = null
    notifyCanonical!()
    // Clearing only the manual candidate reveals the already cached task prompt.
    await vi.waitFor(() => expect(storedSlot(store)?.title).toBe('Scanner value'))
    stop()
  })

  it('does not transfer a manual override to an admitted unresolvable successor', async () => {
    const store = makeState({ executionHostId: 'ssh:dev-box', worktreeId: 'worktree-1' })
    const resolveSessionTitles = vi.fn(async () => ({
      titles: [
        {
          agent: 'codex' as const,
          sessionId: 'codex-session',
          title: 'Scanner value',
          providerName: { kind: 'absent' as const },
          generatedTitle: 'Scanner value'
        }
      ]
    }))
    const stop = startAiVaultTabTitleSync({
      ...store,
      resolveSessionTitles,
      getCanonicalTitle: (_host, _agent, sessionId) =>
        sessionId === 'codex-session' ? 'Renamed by user' : null,
      subscribeCanonicalTitles: () => () => undefined
    })
    await vi.waitFor(() => expect(storedSlot(store)?.title).toBe('Renamed by user'))

    store.setProviderSessionId('codex-session-2')
    await vi.waitFor(() => expect(resolveSessionTitles).toHaveBeenCalledTimes(2))
    expect(storedSlot(store)).toMatchObject({ sessionId: 'codex-session-2', manualTitle: null })
    expect(storedSlot(store)?.title).not.toBe('Renamed by user')
    stop()
  })
})
