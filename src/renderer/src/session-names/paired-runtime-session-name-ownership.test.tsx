// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { rowConversationName } from '@/components/dashboard/snapshot/dashboard-card-labels'
import { useAgentRowConversationName } from '@/components/dashboard/rows/use-agent-row-conversation-name'
import type { DashboardAgentRow } from '@/components/dashboard/rows/dashboard-agent-row'
import { isInheritedFromActivePane } from '@/hooks/ipc-events/agent-status/agent-status-routing'
import { collectAgentPaneConversations } from '@/lib/agent-session/identity/pane-agent-conversations'
import { buildMirroredAgentStatusPatch } from '@/runtime/web-session-tabs-sync/agent-status/agent-status-patch'
import { buildMirroredTerminalTabs } from '@/runtime/web-session-tabs-sync/tab-projection/terminal-build'
import { useAppStore } from '@/store'
import { TEST_REPO } from '@/store/repos/repo.test-fixture'
import { resolveAgentStatusLiveEntryTiming } from '@/store/slices/agent-status/live-status/agent-status-live-entry-timing'
import { makeUnifiedTab } from '@/store/slices/tabs/tab-group.test-fixture'
import { makeWorktree } from '@/store/slices/worktrees/worktree.test-fixture'
import { makeTab } from '@/store/terminals/testing/terminal-tab.test-fixture'
import { isAiVaultTitleAgent } from '../../../shared/ai-vault/contracts/ai-vault-session-title'
import type { RuntimeMobileSessionTerminalClientTab } from '../../../shared/remote-runtime/session-graph/runtime-mobile-session-tab-contracts'
import { resolveTerminalTabTitle } from '../../../shared/workspace-layout/tab-groups/tab-title-resolution'
import { livePaneNameSessionId } from './live-pane-name-session'
import { sessionNameStore } from './session-name-store'
import { useActivitySessionNames } from './use-activity-session-names'

const LEAF_1 = '11111111-1111-4111-8111-111111111111'

describe('paired runtime session-name ownership across envId/null transitions and cold/rebuilt panes', () => {
  const initialState = useAppStore.getState()

  beforeEach(() => {
    sessionNameStore.reset()
    useAppStore.setState(initialState, true)
  })

  afterEach(() => {
    sessionNameStore.reset()
    useAppStore.setState(initialState, true)
  })

  it('keeps paired headless runtime tab, sidebar, dashboard, and activity titles aligned across envId -> null -> envId updates and rejects unverified A->B reuse', () => {
    const runtimeRepo = {
      ...TEST_REPO,
      id: 'repo-dbox',
      executionHostId: 'runtime:dbox' as const
    }
    const wt = {
      ...makeWorktree({
        id: 'wt-dbox',
        repoId: runtimeRepo.id,
        path: '/data00/home/user/ai_work/orca'
      }),
      hostId: 'runtime:dbox' as const
    }
    const hostSlot = {
      agent: 'claude' as const,
      sessionId: '94a2b22f-1a66-4568-b82a-88a996a481b7',
      title: '会话与 Tab 标题不一致',
      generatedTitle: '排查会话与 Tab 标题不一致',
      providerName: {
        kind: 'named' as const,
        title: '会话与 Tab 标题不一致',
        field: 'ai-title.aiTitle'
      }
    }
    const surface: RuntimeMobileSessionTerminalClientTab = {
      type: 'terminal',
      id: `host-tab::${LEAF_1}`,
      parentTabId: 'host-tab',
      leafId: LEAF_1,
      title: '✳ Claude Code',
      isActive: true,
      launchAgent: 'claude',
      status: 'pending-handle',
      terminal: null,
      aiVaultTitle: hostSlot,
      agentStatus: {
        paneKey: `host-tab:${LEAF_1}`,
        terminalTitle: '✳ Claude Code',
        state: 'working',
        agentType: 'claude',
        prompt: '排查会话与 Tab 标题不一致',
        stateHistory: [],
        providerSession: { key: 'session_id', id: hostSlot.sessionId },
        interrupted: false,
        stateStartedAt: 1_000,
        updatedAt: 1_000
      }
    }

    const mirroredTabs = buildMirroredTerminalTabs(
      {
        worktree: wt.id,
        publicationEpoch: 'epoch-dbox',
        snapshotVersion: 1,
        activeGroupId: null,
        activeTabType: 'terminal',
        activeTabId: 'host-tab',
        tabs: [surface]
      },
      'dbox',
      new Map(),
      {},
      {},
      0,
      1_000
    )
    const mirroredTab = mirroredTabs[0]!.tab
    const mirroredLayout = mirroredTabs[0]!.layout
    const paneKey = `${mirroredTab.id}:${LEAF_1}`

    useAppStore.setState({
      settings: {
        ...initialState.settings!,
        tabAutoGenerateTitle: true
      },
      repos: [runtimeRepo],
      worktreesByRepo: { [runtimeRepo.id]: [wt] },
      tabsByWorktree: { [wt.id]: [mirroredTab] },
      terminalLayoutsByTabId: { [mirroredTab.id]: mirroredLayout },
      unifiedTabsByWorktree: {
        [wt.id]: [
          makeUnifiedTab({
            id: `u-${mirroredTab.id}`,
            entityId: mirroredTab.id,
            worktreeId: wt.id,
            groupId: 'g-dbox',
            contentType: 'terminal',
            executionHostId: 'runtime:dbox',
            label: mirroredTab.title
          })
        ]
      }
    })

    const statusPatch = buildMirroredAgentStatusPatch(
      useAppStore.getState(),
      [mirroredTab],
      [surface],
      mirroredTabs,
      'dbox',
      wt.id,
      new Set(),
      1_000
    )
    expect(statusPatch).not.toBeNull()
    useAppStore.setState(statusPatch!)
    expect(useAppStore.getState().agentStatusByPaneKey.get(paneKey)?.connectionId).toBe('dbox')

    // Remote PTY on paired client emits OSC frame with routing.connectionId = null and follow-up prompt.
    act(() => {
      useAppStore
        .getState()
        .setAgentStatus(
          paneKey,
          { state: 'done', prompt: '你执行啊', agentType: 'claude', sessionBoundary: false },
          '✳ Claude Code',
          { updatedAt: 2_000, stateStartedAt: 2_000 },
          { worktreeId: wt.id, tabId: mirroredTab.id, connectionId: null }
        )
      useAppStore.getState().setGeneratedTabTitleFromAgentPrompt(paneKey, '你执行啊')
    })

    const afterOscTab = useAppStore.getState().tabsByWorktree[wt.id]![0]!
    const afterOscEntry = useAppStore.getState().agentStatusByPaneKey.get(paneKey)!
    expect(afterOscEntry.providerSession?.id).toBe(hostSlot.sessionId)
    expect(useAppStore.getState().agentConversationsByPaneKey[paneKey]?.providerSession?.id).toBe(
      hostSlot.sessionId
    )
    expect(afterOscTab.generatedTitle).toBeUndefined()
    expect(resolveTerminalTabTitle(afterOscTab, true, afterOscTab.title)).toBe(
      '会话与 Tab 标题不一致'
    )

    const sidebarRow: DashboardAgentRow = {
      paneKey,
      state: afterOscEntry.state,
      startedAt: afterOscEntry.stateStartedAt,
      agentType: 'claude',
      tab: afterOscTab,
      entry: afterOscEntry
    }
    const { result: sidebarName } = renderHook(() => useAgentRowConversationName(sidebarRow))
    expect(sidebarName.current).toBe('会话与 Tab 标题不一致')
    expect(
      rowConversationName(
        sidebarRow,
        true,
        mirroredLayout,
        undefined,
        new Map(),
        useAppStore.getState().unifiedTabsByWorktree
      )
    ).toBe('会话与 Tab 标题不一致')

    // Closed-tab Activity event with mirrored connectionId = 'dbox' still resolves host as runtime:dbox (never ssh:dbox).
    sessionNameStore.seed([
      {
        id: `claude:${hostSlot.sessionId}`,
        sessionId: hostSlot.sessionId,
        agent: 'claude',
        title: hostSlot.title,
        providerName: hostSlot.providerName,
        cwd: wt.path,
        branch: null,
        model: null,
        filePath: `/tmp/${hostSlot.sessionId}.jsonl`,
        codexHome: null,
        createdAt: null,
        updatedAt: null,
        modifiedAt: '2026-11-26T00:00:02.000Z',
        messageCount: 1,
        totalTokens: 0,
        previewMessages: [],
        queuedMessageCount: 0,
        subagentTranscriptCount: 0,
        subagent: null,
        resumeCommand: '',
        executionHostId: 'runtime:dbox'
      }
    ])
    const closedRuntimeEvent = {
      id: 'closed-dbox-event',
      observedAt: 1_500,
      agentAlive: false,
      unread: false,
      entry: {
        ...afterOscEntry,
        paneKey: 'web-terminal-closed:11111111-1111-4111-8111-111111111111',
        tabId: 'web-terminal-closed',
        connectionId: 'dbox',
        prompt: '你执行啊'
      },
      tab: makeTab({
        id: 'web-terminal-closed',
        worktreeId: wt.id,
        ptyId: null,
        title: '✳ Claude Code'
      }),
      worktree: wt,
      repo: runtimeRepo,
      agentType: 'claude' as const,
      state: 'done' as const,
      timestamp: 1_500
    }
    const liveRuntimeSnapshot = {
      entry: afterOscEntry,
      tab: afterOscTab,
      worktree: wt,
      repo: runtimeRepo,
      agentType: 'claude' as const,
      state: 'working' as const,
      timestamp: 2_000
    }
    const { result: activityNames } = renderHook(() =>
      useActivitySessionNames([closedRuntimeEvent], { [paneKey]: liveRuntimeSnapshot })
    )
    expect(activityNames.current(liveRuntimeSnapshot)).toBe('会话与 Tab 标题不一致')
    expect(activityNames.current(closedRuntimeEvent)).toBe('会话与 Tab 标题不一致')

    // Round-trip envId (working) -> null (done OSC) -> envId (done) keeps providerSession, conversation identity, and state clock continuous.
    const firstClockAfterOsc = afterOscEntry.firstStateStartedAt
    act(() => {
      useAppStore
        .getState()
        .setAgentStatus(
          paneKey,
          { state: 'done', prompt: '继续排查', agentType: 'claude', sessionBoundary: false },
          '✳ Claude Code',
          { updatedAt: 2_500, stateStartedAt: 2_500 },
          { worktreeId: wt.id, tabId: mirroredTab.id, connectionId: 'dbox' }
        )
    })
    const afterRoundTrip = useAppStore.getState().agentStatusByPaneKey.get(paneKey)!
    expect(afterRoundTrip.providerSession?.id).toBe(hostSlot.sessionId)
    expect(afterRoundTrip.firstStateStartedAt).toBe(firstClockAfterOsc)
    expect(useAppStore.getState().agentConversationsByPaneKey[paneKey]?.connectionId).toBeNull()

    // Direct timing helper preserves Codex turn context across mirrored envId vs remote PTY null connectionId.
    const codexMirroredEntry = {
      ...afterRoundTrip,
      agentType: 'codex' as const,
      connectionId: 'dbox',
      state: 'working' as const,
      stateStartedAt: 1_000,
      turnStartedAt: 1_000,
      providerSession: { key: 'session_id' as const, id: 'codex-thread-1' }
    }
    const codexTiming = resolveAgentStatusLiveEntryTiming(
      codexMirroredEntry,
      'codex',
      {
        payload: { state: 'working', prompt: '继续', agentType: 'codex' },
        routing: { worktreeId: wt.id, tabId: mirroredTab.id, connectionId: null },
        updatedAt: 2_600,
        executionHostId: 'runtime:dbox'
      },
      false
    )
    expect(codexTiming.stateStartedAt).toBe(1_000)
    expect(codexTiming.turnStartedAt).toBe(1_000)

    // Nested CLI hook suppression treats mirrored envId and remote PTY null as the same paired terminal owner.
    expect(
      isInheritedFromActivePane(
        { ...afterRoundTrip, connectionId: 'dbox', agentType: 'claude', state: 'working' },
        {
          paneKey,
          worktreeId: wt.id,
          connectionId: null,
          state: 'working',
          prompt: 'nested codex call',
          agentType: 'codex',
          stateStartedAt: 2_600,
          receivedAt: 2_600
        },
        'codex',
        { connectionId: null, worktreeId: wt.id, executionHostId: 'runtime:dbox' }
      )
    ).toBe(true)

    // Legacy persisted agentConversationsByPaneKey saved with connectionId = environmentId still reads back cleanly.
    useAppStore.setState({
      agentStatusByPaneKey: useAppStore.getState().agentStatusByPaneKey.replace([]),
      agentConversationsByPaneKey: {
        [paneKey]: {
          paneKey,
          worktreeId: wt.id,
          executionHostId: 'runtime:dbox',
          connectionId: 'dbox',
          agent: 'claude',
          providerSession: { key: 'session_id', id: hostSlot.sessionId },
          firstStateStartedAt: 1_000
        }
      }
    })
    const legacyRecovered = collectAgentPaneConversations(
      useAppStore.getState(),
      isAiVaultTitleAgent,
      { pane: { worktreeId: wt.id, paneKey } }
    )
    expect(legacyRecovered[0]?.providerSession.id).toBe(hostSlot.sessionId)

    // Negative counterexample 1: headless A exits -> B starts on the same leaf & same agent without ID/boundary.
    // Neither mirroredSessionNameOwnership nor livePaneNameSessionId may leak A's saved aiVaultTitle onto B.
    const coldTabs = buildMirroredTerminalTabs(
      {
        worktree: wt.id,
        publicationEpoch: 'epoch-cold',
        snapshotVersion: 2,
        activeGroupId: null,
        activeTabType: 'terminal',
        activeTabId: 'host-tab',
        tabs: [
          {
            ...surface,
            agentStatus: {
              paneKey: `host-tab:${LEAF_1}`,
              terminalTitle: '✳ Claude Code',
              state: 'done',
              agentType: 'claude',
              prompt: '新会话 B 的提示词',
              stateHistory: [],
              interrupted: false,
              stateStartedAt: 3_000,
              updatedAt: 3_000
            }
          }
        ]
      },
      'dbox',
      new Map(),
      {},
      {},
      0,
      3_000
    )
    const coldTab = coldTabs[0]!.tab
    expect(coldTab.aiVaultTitle).toBeUndefined()

    const staleCachedTab = { ...coldTab, aiVaultTitle: hostSlot }
    useAppStore.setState({
      tabsByWorktree: { [wt.id]: [staleCachedTab] },
      terminalLayoutsByTabId: { [staleCachedTab.id]: coldTabs[0]!.layout },
      agentConversationsByPaneKey: {},
      agentStatusByPaneKey: useAppStore.getState().agentStatusByPaneKey.replace([
        [
          paneKey,
          {
            paneKey,
            tabId: staleCachedTab.id,
            worktreeId: wt.id,
            connectionId: 'dbox',
            terminalTitle: '✳ Claude Code',
            state: 'done',
            prompt: '新会话 B 的提示词',
            stateHistory: [],
            agentType: 'claude',
            interrupted: false,
            stateStartedAt: 3_000,
            updatedAt: 3_000
          }
        ]
      ])
    })
    const coldEntry = useAppStore.getState().agentStatusByPaneKey.get(paneKey)!
    expect(
      livePaneNameSessionId(useAppStore.getState(), coldEntry, 'runtime:dbox', staleCachedTab)
    ).toBeUndefined()
    const { result: coldSidebarName } = renderHook(() =>
      useAgentRowConversationName({
        paneKey,
        state: 'done',
        startedAt: 3_000,
        agentType: 'claude',
        tab: staleCachedTab,
        entry: coldEntry
      })
    )
    expect(coldSidebarName.current).toBeNull()

    // Negative counterexample 2: PTY swap / terminal rebuild invalidates the previous pane conversation binding.
    const rebuiltTab = { ...staleCachedTab, ptyId: 'remote-pty-rebuilt-2', generation: 2 }
    useAppStore.setState({
      tabsByWorktree: { [wt.id]: [rebuiltTab] },
      terminalLayoutsByTabId: {
        [rebuiltTab.id]: {
          ...coldTabs[0]!.layout,
          ptyIdsByLeafId: { [LEAF_1]: 'remote-pty-rebuilt-2' }
        }
      },
      agentConversationsByPaneKey: {}
    })
    expect(
      livePaneNameSessionId(useAppStore.getState(), coldEntry, 'runtime:dbox', rebuiltTab)
    ).toBeUndefined()
  })
})
