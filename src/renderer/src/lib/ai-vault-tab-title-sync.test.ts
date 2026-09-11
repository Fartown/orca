import { describe, expect, it, vi } from 'vitest'
import type {
  AiVaultSessionTitlesArgs,
  AiVaultSessionTitlesResult
} from '../../../shared/ai-vault-session-title'
import { resolveTerminalTabTitle } from '../../../shared/tab-title-resolution'
import type { TerminalTab } from '../../../shared/terminal-tab-types'
import {
  collectAiVaultTitleRequests,
  type AiVaultTitleRequest
} from './ai-vault-tab-title-requests'
import {
  batchAiVaultTitleRequests,
  settleAiVaultTitleRequestBatches
} from './ai-vault-tab-title-batches'
import { aiVaultTitleSyncInputsChanged } from './ai-vault-tab-title-sync-inputs'
import { startAiVaultTabTitleSync } from './ai-vault-tab-title-sync'
import { createSessionNameStore } from '../session-names/session-name-store'
import type { AppState } from '@/store/types'

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

function makeState(args: {
  agent?: 'claude' | 'codex'
  aiVaultTitle?: TerminalTab['aiVaultTitle']
  executionHostId: 'ssh:dev-box' | 'runtime:server-1'
  sleeping?: boolean
  path: string
  worktreeId: string
}) {
  const agent = args.agent ?? 'codex'
  const tab = terminalTab(args.worktreeId, args.aiVaultTitle)
  const listeners = new Set<(state: AppState, previous: AppState) => void>()
  const providerSession = {
    key: 'session_id' as const,
    id: `${agent}-session`,
    transcriptPath: `/sessions/${agent}.jsonl`
  }
  const statusEntry = {
    state: 'done' as const,
    prompt: '',
    updatedAt: 1,
    stateStartedAt: 1,
    agentType: agent,
    paneKey: 'tab-1:leaf-1',
    tabId: 'tab-1',
    worktreeId: args.worktreeId,
    providerSession,
    stateHistory: []
  }
  let state = {
    activeWorktreeId: args.worktreeId,
    activeWorkspaceExecutionHostId: args.executionHostId,
    agentStatusByPaneKey: args.sleeping ? {} : { 'tab-1:leaf-1': statusEntry },
    retainedAgentsByPaneKey: {},
    sleepingAgentSessionsByPaneKey: args.sleeping
      ? {
          'tab-1:leaf-1': {
            paneKey: 'tab-1:leaf-1',
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
        root: { type: 'leaf', leafId: 'leaf-1' },
        activeLeafId: 'leaf-1',
        expandedLeafId: null
      }
    },
    worktreesByRepo: {},
    detectedWorktreesByRepo: {},
    folderWorkspaces: [],
    getKnownWorktreeById: () => ({ path: args.path }),
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
      for (const listener of listeners) {
        listener(state, previous)
      }
    }
  } as unknown as AppState
  return {
    getState: () => state,
    pingAgentStatus: () => {
      const previous = state
      state = {
        ...state,
        agentStatusByPaneKey: Object.fromEntries(
          Object.entries(state.agentStatusByPaneKey).map(([paneKey, entry]) => [
            paneKey,
            { ...entry, updatedAt: entry.updatedAt + 1 }
          ])
        )
      }
      for (const listener of listeners) {
        listener(state, previous)
      }
    },
    setProviderSessionId: (sessionId: string) => {
      const previous = state
      state = {
        ...state,
        agentStatusByPaneKey: Object.fromEntries(
          Object.entries(state.agentStatusByPaneKey).map(([paneKey, entry]) => {
            if (!entry.providerSession) {
              return [paneKey, entry]
            }
            return [
              paneKey,
              { ...entry, providerSession: { ...entry.providerSession, id: sessionId } }
            ]
          })
        )
      }
      for (const listener of listeners) {
        listener(state, previous)
      }
    },
    setWorkspacePath: (path: string) => {
      args.path = path
      const previous = state
      state = { ...state, worktreesByRepo: { changed: [] } }
      for (const listener of listeners) {
        listener(state, previous)
      }
    },
    removeSleepingRecord: () => {
      const previous = state
      state = { ...state, sleepingAgentSessionsByPaneKey: {} }
      for (const listener of listeners) {
        listener(state, previous)
      }
    },
    subscribe: (listener: (next: AppState, previous: AppState) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}

describe('AI Vault tab title sync', () => {
  it('keeps polling missing native evidence at the short interval despite a task fallback', async () => {
    const store = makeState({
      executionHostId: 'ssh:dev-box',
      worktreeId: 'worktree-1',
      path: '/workspace'
    })
    let delay: number | undefined
    const stop = startAiVaultTabTitleSync({
      ...store,
      resolveSessionTitles: async () => ({
        titles: [],
        nameEvidence: [
          {
            agent: 'codex',
            sessionId: 'codex-session',
            providerName: { kind: 'absent' },
            generatedTitle: '运行测试'
          }
        ]
      }),
      setTimer: (_callback, ms) => {
        delay = ms
        return 1
      },
      clearTimer: () => {}
    })
    await vi.waitFor(() =>
      expect(store.getState().tabsByWorktree['worktree-1'][0].aiVaultTitle?.title).toBe('运行测试')
    )
    expect(delay).toBe(20_000)
    stop()
  })

  it('projects a shared-cache rename into a sleeping tab without a request feedback loop', async () => {
    const store = makeState({
      executionHostId: 'ssh:dev-box',
      worktreeId: 'worktree-1',
      path: '/workspace',
      sleeping: true
    })
    const resolve = vi.fn(async () => titleResult('codex', 'First native'))
    const names = createSessionNameStore(resolve)
    const stop = startAiVaultTabTitleSync({
      ...store,
      resolveSessionTitles: names.resolveSessionTitles,
      subscribeSessionNames: names.subscribe
    })
    await vi.waitFor(() =>
      expect(store.getState().tabsByWorktree['worktree-1'][0].aiVaultTitle?.title).toBe(
        'First native'
      )
    )
    names.publish('ssh:dev-box', titleResult('codex', 'Renamed elsewhere'))
    await vi.waitFor(() =>
      expect(store.getState().tabsByWorktree['worktree-1'][0].aiVaultTitle?.title).toBe(
        'Renamed elsewhere'
      )
    )
    expect(resolve).toHaveBeenCalledTimes(1)
    stop()
    names.reset()
  })

  it('treats a source-only slot transition as a sync input change', () => {
    const store = makeState({
      executionHostId: 'ssh:dev-box',
      worktreeId: 'worktree-1',
      path: '/workspace/albacore',
      aiVaultTitle: {
        agent: 'codex',
        sessionId: 'codex-session',
        title: 'Same visible title',
        source: 'provider'
      }
    })
    const previous = store.getState()
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
    'projects the canonical %s AI Vault session title',
    async (agent) => {
      const store = makeState({
        agent,
        executionHostId: 'ssh:dev-box',
        worktreeId: 'worktree-1',
        path: '/workspace/albacore'
      })
      const resolveSessionTitles = vi.fn(async () => titleResult(agent, `${agent} conversation`))
      const stop = startAiVaultTabTitleSync({ ...store, resolveSessionTitles })

      await vi.waitFor(() =>
        expect(store.getState().tabsByWorktree['worktree-1'][0].aiVaultTitle).toEqual({
          agent,
          sessionId: `${agent}-session`,
          title: `${agent} conversation`,
          providerName: { kind: 'named', title: `${agent} conversation`, field: 'test.nativeName' },
          manualTitle: null,
          source: 'provider'
        })
      )
      expect(resolveSessionTitles).toHaveBeenCalledWith({
        executionHostScope: 'ssh:dev-box',
        requests: [
          {
            agent,
            sessionId: `${agent}-session`,
            transcriptPath: `/sessions/${agent}.jsonl`
          }
        ]
      })
      stop()
    }
  )

  it('uses runtime host authority for folder workspaces', () => {
    const store = makeState({
      executionHostId: 'runtime:server-1',
      worktreeId: 'folder:folder-1',
      path: '/srv/folders/albacore'
    })

    expect(collectAiVaultTitleRequests(store.getState())).toEqual([
      expect.objectContaining({
        executionHostId: 'runtime:server-1',
        tabId: 'tab-1',
        worktreeId: 'folder:folder-1'
      })
    ])
  })

  it('retains a recovered sleeping title after its lifecycle record disappears', async () => {
    const store = makeState({
      executionHostId: 'ssh:dev-box',
      worktreeId: 'worktree-1',
      path: '/workspace/albacore',
      sleeping: true
    })
    const stop = startAiVaultTabTitleSync({
      ...store,
      resolveSessionTitles: async () => titleResult('codex', 'Stable conversation')
    })

    await vi.waitFor(() =>
      expect(store.getState().tabsByWorktree['worktree-1'][0].aiVaultTitle).toBeTruthy()
    )
    store.removeSleepingRecord()
    const restored = store.getState().tabsByWorktree['worktree-1'][0] as TerminalTab
    expect(resolveTerminalTabTitle(restored, false)).toBe('Stable conversation')
    stop()
  })

  it('refreshes a live title when the AI Vault name changes', async () => {
    const store = makeState({
      aiVaultTitle: { agent: 'codex', sessionId: 'codex-session', title: 'First name' },
      executionHostId: 'ssh:dev-box',
      worktreeId: 'worktree-1',
      path: '/workspace/albacore'
    })
    let title = 'First name'
    let refresh: (() => void) | undefined
    const stop = startAiVaultTabTitleSync({
      ...store,
      resolveSessionTitles: async () => titleResult('codex', title),
      setTimer: (callback, delay) => {
        expect(delay).toBe(5 * 60_000)
        refresh = callback
        return 1
      },
      clearTimer: () => {}
    })

    await vi.waitFor(() => expect(refresh).toBeTypeOf('function'))
    title = 'Renamed conversation'
    refresh?.()
    await vi.waitFor(() =>
      expect(store.getState().tabsByWorktree['worktree-1'][0].aiVaultTitle?.title).toBe(
        'Renamed conversation'
      )
    )
    stop()
  })

  it('retries a missing live title without waiting for the long refresh', async () => {
    const store = makeState({
      executionHostId: 'ssh:dev-box',
      worktreeId: 'worktree-1',
      path: '/workspace/albacore'
    })
    let refreshDelay: number | undefined
    const stop = startAiVaultTabTitleSync({
      ...store,
      resolveSessionTitles: async () => ({ titles: [] }),
      setTimer: (_callback, delay) => {
        refreshDelay = delay
        return 1
      },
      clearTimer: () => {}
    })

    await vi.waitFor(() => expect(refreshDelay).toBe(20_000))
    stop()
  })

  it('defers title reads through the configured background scheduler', async () => {
    const store = makeState({
      executionHostId: 'ssh:dev-box',
      worktreeId: 'worktree-1',
      path: '/workspace/albacore'
    })
    const resolveSessionTitles = vi.fn(async () => titleResult('codex', 'Deferred conversation'))
    let runScheduled: (() => void) | undefined
    const cancelScheduled = vi.fn()
    const stop = startAiVaultTabTitleSync({
      ...store,
      resolveSessionTitles,
      scheduleReconcile: (callback) => {
        runScheduled = callback
        return cancelScheduled
      }
    })

    expect(resolveSessionTitles).not.toHaveBeenCalled()
    runScheduled?.()
    await vi.waitFor(() => expect(resolveSessionTitles).toHaveBeenCalledTimes(1))
    stop()
  })

  it('does not reread when a live status ping preserves title inputs', async () => {
    const store = makeState({
      executionHostId: 'ssh:dev-box',
      worktreeId: 'worktree-1',
      path: '/workspace/albacore'
    })
    const resolveSessionTitles = vi.fn(async () => titleResult('codex', 'Stable conversation'))
    const stop = startAiVaultTabTitleSync({ ...store, resolveSessionTitles })

    await vi.waitFor(() => expect(resolveSessionTitles).toHaveBeenCalledTimes(1))
    store.pingAgentStatus()
    await Promise.resolve()
    await Promise.resolve()

    expect(resolveSessionTitles).toHaveBeenCalledTimes(1)
    stop()
  })

  it('does not reread titles when only the worktree path changes', async () => {
    const store = makeState({
      executionHostId: 'ssh:dev-box',
      worktreeId: 'worktree-1',
      path: '/workspace/albacore'
    })
    const resolveSessionTitles = vi.fn(async () => titleResult('codex', 'Stable conversation'))
    const stop = startAiVaultTabTitleSync({ ...store, resolveSessionTitles })

    await vi.waitFor(() => expect(resolveSessionTitles).toHaveBeenCalledTimes(1))
    store.setWorkspacePath('/workspace/renamed-albacore')
    await Promise.resolve()
    await Promise.resolve()

    expect(resolveSessionTitles).toHaveBeenCalledTimes(1)
    stop()
  })

  it('does not retain another session name after an admitted identity changes without a title', async () => {
    const store = makeState({
      executionHostId: 'ssh:dev-box',
      worktreeId: 'worktree-1',
      path: '/workspace/albacore'
    })
    // Internal calls are rejected upstream; this store transition is an admitted successor.
    const resolveSessionTitles = vi.fn(async () => titleResult('codex', 'Original conversation'))
    const stop = startAiVaultTabTitleSync({ ...store, resolveSessionTitles })

    await vi.waitFor(() => expect(resolveSessionTitles).toHaveBeenCalledTimes(1))
    store.setProviderSessionId('codex-session-2')

    await vi.waitFor(() => expect(resolveSessionTitles).toHaveBeenCalledTimes(2))
    expect(store.getState().tabsByWorktree['worktree-1'][0].aiVaultTitle).toMatchObject({
      sessionId: 'codex-session-2',
      manualTitle: null
    })
    expect(store.getState().tabsByWorktree['worktree-1'][0].aiVaultTitle?.title).not.toBe(
      'Original conversation'
    )
    stop()
  })

  it('does not land an old response after the admitted pane identity has changed', async () => {
    const store = makeState({
      executionHostId: 'ssh:dev-box',
      worktreeId: 'worktree-1',
      path: '/workspace/albacore'
    })
    // Child observations must be rejected by ownership admission, before this state changes.
    const resolveSessionTitles = vi.fn(async () => {
      store.setProviderSessionId('codex-new-session')
      return titleResult('codex', 'Real conversation')
    })
    const stop = startAiVaultTabTitleSync({ ...store, resolveSessionTitles })

    await vi.waitFor(() => expect(resolveSessionTitles).toHaveBeenCalledTimes(2))
    expect(store.getState().tabsByWorktree['worktree-1'][0].aiVaultTitle).toMatchObject({
      sessionId: 'codex-new-session'
    })
    expect(store.getState().tabsByWorktree['worktree-1'][0].aiVaultTitle?.title).not.toBe(
      'Real conversation'
    )
    stop()
  })

  it('replaces the name once the changed provider identity resolves', async () => {
    const store = makeState({
      executionHostId: 'ssh:dev-box',
      worktreeId: 'worktree-1',
      path: '/workspace/albacore'
    })
    const resolveSessionTitles = vi.fn(async (args: AiVaultSessionTitlesArgs) => ({
      titles: args.requests.map((request) => ({
        agent: request.agent,
        sessionId: request.sessionId,
        title:
          request.sessionId === 'codex-session-2' ? 'Next conversation' : 'Original conversation'
      }))
    }))
    const stop = startAiVaultTabTitleSync({ ...store, resolveSessionTitles })

    await vi.waitFor(() =>
      expect(store.getState().tabsByWorktree['worktree-1'][0].aiVaultTitle?.title).toBe(
        'Original conversation'
      )
    )
    store.setProviderSessionId('codex-session-2')

    await vi.waitFor(() =>
      expect(store.getState().tabsByWorktree['worktree-1'][0].aiVaultTitle).toMatchObject({
        sessionId: 'codex-session-2',
        title: 'Next conversation'
      })
    )
    stop()
  })

  it('batches title identities per host within the wire bound', () => {
    const request = (index: number): AiVaultTitleRequest => ({
      agent: 'codex',
      executionHostId: 'ssh:dev-box',
      providerSession: { key: 'session_id', id: `session-${index}` },
      refresh: true,
      tabId: `tab-${index}`,
      worktreeId: `worktree-${index}`
    })
    const groups = batchAiVaultTitleRequests(
      Array.from({ length: 65 }, (_, index) => request(index))
    )

    expect(groups).toHaveLength(2)
    expect(groups[0]).toHaveLength(64)
    expect(groups[1]).toHaveLength(1)
  })

  it('runs hosts concurrently while serializing each host wire', async () => {
    const request = (executionHostId: AiVaultTitleRequest['executionHostId'], index: number) => ({
      agent: 'codex' as const,
      executionHostId,
      providerSession: { key: 'session_id' as const, id: `session-${index}` },
      refresh: true,
      tabId: `tab-${index}`,
      worktreeId: `worktree-${index}`
    })
    const requests = [
      ...Array.from({ length: 65 }, (_, index) => request('ssh:dev-box', index)),
      request('runtime:server-1', 100)
    ]
    const calls: AiVaultTitleRequest[][] = []
    const completions: (() => void)[] = []
    const pending = settleAiVaultTitleRequestBatches(
      requests,
      (batch) =>
        new Promise<void>((resolve) => {
          calls.push(batch)
          completions.push(resolve)
        })
    )

    await vi.waitFor(() => expect(calls).toHaveLength(2))
    expect(calls.map((batch) => batch[0]!.executionHostId)).toEqual([
      'ssh:dev-box',
      'runtime:server-1'
    ])
    completions[0]!()
    await vi.waitFor(() => expect(calls).toHaveLength(3))
    expect(calls[2]).toHaveLength(1)
    completions[1]!()
    completions[2]!()
    await pending
  })
})

describe('canonical conversation title projection', () => {
  it('projects a manual-name notification without waiting for the idle file-scan scheduler', () => {
    const store = makeState({
      executionHostId: 'ssh:dev-box',
      worktreeId: 'worktree-1',
      path: '/workspace/albacore',
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
      expect(store.getState().tabsByWorktree['worktree-1'][0].aiVaultTitle).toMatchObject({
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
      path: '/workspace/albacore',
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
      expect(store.getState().tabsByWorktree['worktree-1'][0].aiVaultTitle).toEqual({
        agent: 'codex',
        sessionId: 'codex-session',
        title: 'Provider after Clear',
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
      path: '/workspace/albacore',
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
    // The slot already holds a matching non-empty title, so the sleeping
    // candidate is excluded from scanning entirely.
    await vi.waitFor(() => expect(resolveSessionTitles).not.toHaveBeenCalled())

    canonical = 'Renamed by user'
    notifyCanonical!()
    await vi.waitFor(() =>
      expect(store.getState().tabsByWorktree['worktree-1'][0].aiVaultTitle).toEqual({
        agent: 'codex',
        sessionId: 'codex-session',
        title: 'Old scanner name',
        manualTitle: 'Renamed by user',
        providerName: { kind: 'named', title: 'Old scanner name', field: 'test.nativeName' },
        source: 'provider'
      })
    )
    expect(resolveSessionTitles).not.toHaveBeenCalled()
    stop()
  })

  it('keeps a canonical manual fallback without replacing a fresh native name', async () => {
    const store = makeState({
      executionHostId: 'ssh:dev-box',
      worktreeId: 'worktree-1',
      path: '/workspace/albacore'
    })
    const stop = startAiVaultTabTitleSync({
      ...store,
      resolveSessionTitles: async () => titleResult('codex', 'Scanner value'),
      getCanonicalTitle: () => 'Canonical value',
      subscribeCanonicalTitles: () => () => undefined
    })
    await vi.waitFor(() =>
      expect(store.getState().tabsByWorktree['worktree-1'][0].aiVaultTitle).toEqual({
        agent: 'codex',
        sessionId: 'codex-session',
        title: 'Scanner value',
        manualTitle: 'Canonical value',
        providerName: { kind: 'named', title: 'Scanner value', field: 'test.nativeName' },
        source: 'provider'
      })
    )
    stop()
  })

  it('clears a projected canonical from the slot after the conversation is forgotten', async () => {
    const store = makeState({
      executionHostId: 'ssh:dev-box',
      worktreeId: 'worktree-1',
      path: '/workspace/albacore',
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
    await vi.waitFor(() =>
      expect(store.getState().tabsByWorktree['worktree-1'][0].aiVaultTitle?.title).toBe('Forget me')
    )

    canonical = null
    notifyCanonical!()
    // Clearing only the manual candidate reveals the already cached task prompt.
    await vi.waitFor(() =>
      expect(store.getState().tabsByWorktree['worktree-1'][0].aiVaultTitle?.title).toBe(
        'Scanner value'
      )
    )
    stop()
  })

  it('does not transfer a manual override to an admitted unresolvable successor', async () => {
    const store = makeState({
      executionHostId: 'ssh:dev-box',
      worktreeId: 'worktree-1',
      path: '/workspace/albacore'
    })
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
    await vi.waitFor(() =>
      expect(store.getState().tabsByWorktree['worktree-1'][0].aiVaultTitle?.title).toBe(
        'Renamed by user'
      )
    )

    store.setProviderSessionId('codex-session-2')
    await vi.waitFor(() => expect(resolveSessionTitles).toHaveBeenCalledTimes(2))
    expect(store.getState().tabsByWorktree['worktree-1'][0].aiVaultTitle).toMatchObject({
      sessionId: 'codex-session-2',
      manualTitle: null
    })
    expect(store.getState().tabsByWorktree['worktree-1'][0].aiVaultTitle?.title).not.toBe(
      'Renamed by user'
    )
    stop()
  })
})
