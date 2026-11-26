// @vitest-environment happy-dom
import { act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  markRendererOwnedAgentStatusWrite,
  registerRendererOwnedAgentStatusPane
} from '@/components/terminal-pane/agent-status/renderer-owned-agent-status-registry'
import { buildMirroredAgentStatusPatch } from '@/runtime/web-session-tabs-sync/agent-status/agent-status-patch'
import { buildMirroredRuntimePaneTitlePatch } from '@/runtime/web-session-tabs-sync/naming/runtime-pane-title-patch'
import { buildMirroredTerminalTabs } from '@/runtime/web-session-tabs-sync/tab-projection/terminal-build'
import { useAppStore } from '@/store'
import { TEST_REPO } from '@/store/repos/repo.test-fixture'
import { makeWorktree } from '@/store/slices/worktrees/worktree.test-fixture'
import type { RuntimeMobileSessionTerminalClientTab } from '../../../shared/remote-runtime/session-graph/runtime-mobile-session-tab-contracts'
import { livePaneNameSessionId } from './live-pane-name-session'
import {
  hostAgentStatusSupersedesClientSession,
  mirroredSessionNameOwnership
} from './mirror-host-manual-name'
import { sessionNameStore } from './session-name-store'

const LEAF_1 = '11111111-1111-4111-8111-111111111111'

describe('mirrored PTY replacement and client OSC fence ownership', () => {
  const initialState = useAppStore.getState()

  beforeEach(() => {
    sessionNameStore.reset()
    useAppStore.setState(initialState, true)
  })

  afterEach(() => {
    sessionNameStore.reset()
    useAppStore.setState(initialState, true)
  })

  it('drops session A, derived titles, and warm pane conversation across PTY replacement and repeated stale snapshots, then lets confirmed B take over', () => {
    const runtimeRepo = {
      ...TEST_REPO,
      id: 'repo-dbox-warm-pty',
      path: '/remote/orca',
      displayName: 'orca',
      executionHostId: 'runtime:dbox' as const
    }
    const wt = makeWorktree({
      id: `${runtimeRepo.id}::/remote/orca`,
      repoId: runtimeRepo.id,
      path: '/remote/orca',
      hostId: 'runtime:dbox'
    })
    const slotA = {
      agent: 'claude' as const,
      sessionId: 'A',
      title: '会话 A',
      providerName: { kind: 'named' as const, title: '会话 A', field: 'ai-title.aiTitle' }
    }
    const surfaceA: RuntimeMobileSessionTerminalClientTab = {
      type: 'terminal',
      id: `host-tab::${LEAF_1}`,
      parentTabId: 'host-tab',
      leafId: LEAF_1,
      title: '会话 A',
      generatedTitle: '首轮任务 A',
      quickCommandLabel: 'claude',
      isActive: true,
      launchAgent: 'claude',
      status: 'ready',
      terminal: 'pty-A',
      aiVaultTitle: slotA,
      agentStatus: {
        paneKey: `host-tab:${LEAF_1}`,
        terminalTitle: '✳ Claude Code',
        state: 'done',
        agentType: 'claude',
        prompt: '排查 A',
        stateHistory: [],
        interrupted: false,
        stateStartedAt: 1_000,
        updatedAt: 1_000,
        providerSession: { key: 'session_id', id: 'A' }
      }
    }
    const baseSnapshot = {
      worktree: wt.id,
      publicationEpoch: 'epoch-warm-pty',
      snapshotVersion: 1,
      activeGroupId: null,
      activeTabType: 'terminal' as const,
      activeTabId: 'host-tab',
      tabs: [surfaceA]
    }
    const [mirroredA] = buildMirroredTerminalTabs(baseSnapshot, 'dbox', new Map(), {}, {}, 0, 1_000)
    expect(mirroredA.tab.aiVaultTitle?.sessionId).toBe('A')
    expect(mirroredA.tab.generatedTitle).toBe('首轮任务 A')

    const existingById = new Map([[mirroredA.tab.id, mirroredA.tab]])
    const existingLayouts = { [mirroredA.tab.id]: mirroredA.layout }
    const paneKey = `${mirroredA.tab.id}:${LEAF_1}`

    // Same PTY with transiently missing providerSession keeps session A and derived names.
    const surfaceSamePtyNoId: RuntimeMobileSessionTerminalClientTab = {
      ...surfaceA,
      title: 'Terminal',
      generatedTitle: undefined,
      aiVaultTitle: undefined,
      agentStatus: {
        ...surfaceA.agentStatus!,
        providerSession: undefined,
        updatedAt: 1_500
      }
    }
    const [samePtyNoId] = buildMirroredTerminalTabs(
      { ...baseSnapshot, snapshotVersion: 2, tabs: [surfaceSamePtyNoId] },
      'dbox',
      existingById,
      existingLayouts,
      {},
      0,
      1_500
    )
    expect(samePtyNoId.tab.ptyId).toBe(mirroredA.tab.ptyId)
    expect(samePtyNoId.tab.aiVaultTitle?.sessionId).toBe('A')
    expect(samePtyNoId.tab.generatedTitle).toBe('首轮任务 A')

    // Pending handle retains pty-A binding and keeps continuity until a new ready PTY replaces it.
    const surfacePending: RuntimeMobileSessionTerminalClientTab = {
      ...surfaceSamePtyNoId,
      status: 'pending-handle',
      terminal: null
    }
    const [whilePending] = buildMirroredTerminalTabs(
      { ...baseSnapshot, snapshotVersion: 3, tabs: [surfacePending] },
      'dbox',
      existingById,
      existingLayouts,
      {},
      0,
      1_600
    )
    expect(whilePending.tab.ptyId).toBe(mirroredA.tab.ptyId)
    expect(whilePending.tab.aiVaultTitle?.sessionId).toBe('A')

    // Warm mirrored leaf rebinding from ready pty-A to ready pty-B without session id/boundary drops A and derived titles.
    const surfacePtyB: RuntimeMobileSessionTerminalClientTab = {
      ...surfaceA,
      status: 'ready',
      terminal: 'pty-B',
      title: '✳ Claude Code',
      generatedTitle: undefined,
      quickCommandLabel: undefined,
      aiVaultTitle: undefined,
      agentStatus: {
        paneKey: `host-tab:${LEAF_1}`,
        terminalTitle: '✳ Claude Code',
        state: 'working',
        agentType: 'claude',
        prompt: '新终端提示词',
        stateHistory: [],
        interrupted: false,
        stateStartedAt: 2_000,
        updatedAt: 2_000
      }
    }
    const [mirroredB] = buildMirroredTerminalTabs(
      { ...baseSnapshot, snapshotVersion: 4, tabs: [surfacePtyB] },
      'dbox',
      existingById,
      existingLayouts,
      {},
      0,
      2_000
    )
    expect(mirroredB.tab.ptyId).not.toBe(mirroredA.tab.ptyId)
    expect(mirroredB.tab.aiVaultTitle).toBeUndefined()
    expect(mirroredB.tab.generatedTitle).toBeUndefined()
    expect(mirroredB.tab.quickCommandLabel).toBeUndefined()
    expect(mirroredB.tab.title).not.toBe('会话 A')
    expect(mirroredB.tab.defaultTitle).not.toBe('会话 A')

    // Unchanged-PTY slotless compatibility: cold slotless mirror retains its summary, and a fresh same-PTY prompt without providerSession adopts its derived summary.
    const [coldSlotless] = buildMirroredTerminalTabs(
      {
        ...baseSnapshot,
        snapshotVersion: 2,
        tabs: [
          {
            ...surfaceA,
            title: 'Terminal',
            aiVaultTitle: undefined,
            generatedTitle: '首轮任务 A',
            agentStatus: undefined
          }
        ]
      },
      'dbox',
      new Map(),
      {},
      {},
      0,
      1_200
    )
    expect(coldSlotless.tab.generatedTitle).toBe('首轮任务 A')
    const [freshSamePtyBlank] = buildMirroredTerminalTabs(
      {
        ...baseSnapshot,
        snapshotVersion: 2,
        tabs: [
          {
            ...surfaceA,
            title: 'Terminal',
            aiVaultTitle: undefined,
            generatedTitle: undefined,
            agentStatus: undefined
          }
        ]
      },
      'dbox',
      new Map(),
      {},
      {},
      0,
      1_300
    )
    const [freshSamePtyPrompt] = buildMirroredTerminalTabs(
      {
        ...baseSnapshot,
        snapshotVersion: 3,
        tabs: [
          {
            ...surfaceA,
            title: 'Terminal',
            aiVaultTitle: undefined,
            generatedTitle: '排查构建失败',
            agentStatus: {
              ...surfaceA.agentStatus!,
              prompt: '排查构建失败',
              providerSession: undefined,
              updatedAt: 1_350
            }
          }
        ]
      },
      'dbox',
      new Map([[freshSamePtyBlank.tab.id, freshSamePtyBlank.tab]]),
      { [freshSamePtyBlank.tab.id]: freshSamePtyBlank.layout },
      {},
      0,
      1_350
    )
    expect(freshSamePtyPrompt.tab.generatedTitle).toBe('排查构建失败')

    // Across pty-A -> pending-handle -> pty-B, repeated stale headless echoes, B identity arriving before B's summary, B's proven summary, Turn 2 continuity, and old snapshot replays.
    const slotB = {
      agent: 'claude' as const,
      sessionId: 'B',
      title: '会话 B',
      generatedTitle: '首轮任务 B',
      providerName: { kind: 'named' as const, title: '会话 B', field: 'ai-title.aiTitle' }
    }
    const mirrorFrom = (
      previous: typeof mirroredA,
      snapshotVersion: number,
      surface: RuntimeMobileSessionTerminalClientTab,
      now: number,
      previousTabOverride = previous.tab
    ) =>
      buildMirroredTerminalTabs(
        { ...baseSnapshot, snapshotVersion, tabs: [surface] },
        'dbox',
        new Map([[previousTabOverride.id, previousTabOverride]]),
        { [previousTabOverride.id]: previous.layout },
        {},
        0,
        now
      )[0]!
    const staleEchoShapes = [
      { aiVaultTitle: slotA, repeatTitle: '会话 A' },
      { aiVaultTitle: undefined, repeatTitle: 'Terminal' },
      { aiVaultTitle: undefined, repeatTitle: '首轮任务 A' }
    ] as const
    for (const shape of staleEchoShapes) {
      const afterPendingPtyB = mirrorFrom(
        whilePending,
        5,
        { ...surfacePtyB, aiVaultTitle: shape.aiVaultTitle, generatedTitle: '首轮任务 A' },
        2_100
      )
      expect(afterPendingPtyB.tab.ptyId).not.toBe(mirroredA.tab.ptyId)
      expect(afterPendingPtyB.tab.aiVaultTitle).toBeUndefined()
      expect(afterPendingPtyB.tab.generatedTitle).toBeUndefined()

      const repeatStalePtyB = mirrorFrom(
        afterPendingPtyB,
        6,
        {
          ...surfacePtyB,
          title: shape.repeatTitle,
          aiVaultTitle: shape.aiVaultTitle,
          generatedTitle: '首轮任务 A'
        },
        2_150
      )
      expect(repeatStalePtyB.tab.ptyId).toBe(afterPendingPtyB.tab.ptyId)
      expect(repeatStalePtyB.tab.aiVaultTitle).toBeUndefined()
      expect(repeatStalePtyB.tab.generatedTitle).toBeUndefined()
      expect(repeatStalePtyB.tab.title).not.toBe('会话 A')
      expect(repeatStalePtyB.tab.title).not.toBe('首轮任务 A')

      // B's providerSession.id arriving before host updates generatedTitle must NOT revive rejected A summary.
      const identityFirstBSurface: RuntimeMobileSessionTerminalClientTab = {
        ...surfacePtyB,
        title: '首轮任务 A',
        aiVaultTitle: undefined,
        generatedTitle: '首轮任务 A',
        agentStatus: {
          ...surfacePtyB.agentStatus!,
          providerSession: { key: 'session_id', id: 'B' },
          prompt: 'B 的新请求',
          updatedAt: 2_180
        }
      }
      const identityFirstB = mirrorFrom(repeatStalePtyB, 7, identityFirstBSurface, 2_180)
      expect(identityFirstB.tab.generatedTitle).toBeUndefined()
      expect(identityFirstB.tab.title).not.toBe('首轮任务 A')

      // Once B's real prompt-derived summary arrives (slotless), it takes over, survives Turn 2 (even across tab clone), and resists stale replays.
      const slotlessSummaryB = mirrorFrom(
        identityFirstB,
        8,
        {
          ...identityFirstBSurface,
          title: 'B 的新请求',
          generatedTitle: 'B 的新请求',
          agentStatus: { ...identityFirstBSurface.agentStatus!, updatedAt: 2_190 }
        },
        2_190
      )
      expect(slotlessSummaryB.tab.generatedTitle).toBe('B 的新请求')
      expect(slotlessSummaryB.tab.title).toBe('B 的新请求')
      expect(slotlessSummaryB.tab.generatedTitleOwner).toEqual({ agent: 'claude', sessionId: 'B' })

      const turn2SlotlessB = mirrorFrom(
        slotlessSummaryB,
        9,
        {
          ...identityFirstBSurface,
          title: 'B 的新请求',
          generatedTitle: 'B 的新请求',
          agentStatus: {
            ...identityFirstBSurface.agentStatus!,
            prompt: '继续检查测试',
            updatedAt: 2_200
          }
        },
        2_200,
        { ...slotlessSummaryB.tab, isPinned: true }
      )
      expect(turn2SlotlessB.tab.generatedTitle).toBe('B 的新请求')

      for (const replaySurface of [
        identityFirstBSurface,
        {
          ...surfacePtyB,
          title: '首轮任务 A',
          aiVaultTitle: shape.aiVaultTitle,
          generatedTitle: '首轮任务 A'
        },
        {
          ...identityFirstBSurface,
          agentStatus: { ...identityFirstBSurface.agentStatus!, prompt: '首轮任务 A' }
        }
      ]) {
        const afterReplay = mirrorFrom(turn2SlotlessB, 10, replaySurface, 2_210)
        expect(afterReplay.tab.generatedTitle).toBe('B 的新请求')
        expect(afterReplay.tab.title).toBe('B 的新请求')
      }

      // Same-PTY switch from slotless B to C drops B's summary instead of leaking it onto C.
      const samePtySwitchC = mirrorFrom(
        turn2SlotlessB,
        11,
        {
          ...identityFirstBSurface,
          title: 'B 的新请求',
          generatedTitle: 'B 的新请求',
          agentStatus: {
            ...identityFirstBSurface.agentStatus!,
            providerSession: { key: 'session_id', id: 'C' },
            prompt: 'C 的新任务',
            updatedAt: 2_220
          }
        },
        2_220
      )
      expect(samePtySwitchC.tab.generatedTitle).toBeUndefined()
      expect(samePtySwitchC.tab.title).not.toBe('B 的新请求')

      // Slotted B carrying slotB.generatedTitle takes over even after prompt moves on, and resists stale replay.
      const evidencedBWithSlot = mirrorFrom(
        identityFirstB,
        8,
        {
          ...surfacePtyB,
          title: '会话 B',
          aiVaultTitle: slotB,
          generatedTitle: '首轮任务 B',
          agentStatus: {
            ...surfacePtyB.agentStatus!,
            providerSession: { key: 'session_id', id: 'B' },
            prompt: '继续检查测试',
            updatedAt: 2_190
          }
        },
        2_190
      )
      expect(evidencedBWithSlot.tab.aiVaultTitle?.sessionId).toBe('B')
      expect(evidencedBWithSlot.tab.generatedTitle).toBe('首轮任务 B')
      expect(evidencedBWithSlot.tab.title).toBe('会话 B')
      const slottedAfterReplay = mirrorFrom(evidencedBWithSlot, 9, identityFirstBSurface, 2_210)
      expect(slottedAfterReplay.tab.aiVaultTitle?.sessionId).toBe('B')
      expect(slottedAfterReplay.tab.generatedTitle).toBe('首轮任务 B')
      expect(slottedAfterReplay.tab.title).toBe('会话 B')
    }

    // Full warm-store status/conversation/pane-title reconciliation drops A without manually clearing agentConversationsByPaneKey.
    useAppStore.setState({
      repos: [runtimeRepo],
      worktreesByRepo: { [runtimeRepo.id]: [wt] },
      tabsByWorktree: { [wt.id]: [mirroredA.tab] },
      terminalLayoutsByTabId: { [mirroredA.tab.id]: mirroredA.layout },
      runtimePaneTitlesByTabId: { [mirroredA.tab.id]: { 1: '会话 A OSC' } }
    })
    const warmStatusPatchA = buildMirroredAgentStatusPatch(
      useAppStore.getState(),
      [mirroredA.tab],
      [surfaceA],
      [mirroredA],
      'dbox',
      wt.id,
      new Set(),
      1_000
    )
    useAppStore.setState(warmStatusPatchA!)
    expect(useAppStore.getState().agentConversationsByPaneKey[paneKey]?.providerSession?.id).toBe(
      'A'
    )

    const warmStatusPatchB = buildMirroredAgentStatusPatch(
      useAppStore.getState(),
      [mirroredA.tab],
      [surfacePtyB],
      [mirroredB],
      'dbox',
      wt.id,
      new Set(),
      2_000
    )
    const warmTitlePatchB = buildMirroredRuntimePaneTitlePatch(
      useAppStore.getState(),
      [mirroredB],
      [surfacePtyB],
      2_000
    )
    useAppStore.setState({
      ...warmStatusPatchB,
      ...warmTitlePatchB,
      tabsByWorktree: { [wt.id]: [mirroredB.tab] },
      terminalLayoutsByTabId: { [mirroredB.tab.id]: mirroredB.layout }
    })
    const entryB = useAppStore.getState().agentStatusByPaneKey.get(paneKey)!
    expect(entryB.providerSession).toBeUndefined()
    expect(
      useAppStore.getState().agentConversationsByPaneKey[paneKey]?.providerSession
    ).toBeUndefined()
    expect(
      livePaneNameSessionId(useAppStore.getState(), entryB, 'runtime:dbox', mirroredB.tab)
    ).toBeUndefined()
    expect(useAppStore.getState().runtimePaneTitlesByTabId[mirroredB.tab.id]?.[1]).not.toBe(
      '会话 A OSC'
    )

    // Explicit resume on pty-B carrying providerSession.id === 'A' legitimately retains session A.
    const [resumedOnPtyB] = buildMirroredTerminalTabs(
      {
        ...baseSnapshot,
        snapshotVersion: 9,
        tabs: [
          {
            ...surfacePtyB,
            agentStatus: {
              ...surfacePtyB.agentStatus!,
              providerSession: { key: 'session_id', id: 'A' }
            }
          }
        ]
      },
      'dbox',
      existingById,
      existingLayouts,
      {},
      0,
      2_200
    )
    expect(resumedOnPtyB.tab.ptyId).not.toBe(mirroredA.tab.ptyId)
    expect(resumedOnPtyB.tab.aiVaultTitle?.sessionId).toBe('A')

    // Replacing pty-A with a shell pty-C (no agentStatus) retires both agentStatus and warm conversation.
    useAppStore.setState({
      tabsByWorktree: { [wt.id]: [mirroredA.tab] },
      terminalLayoutsByTabId: { [mirroredA.tab.id]: mirroredA.layout },
      ...warmStatusPatchA
    })
    const surfaceShellC: RuntimeMobileSessionTerminalClientTab = {
      ...surfaceA,
      status: 'ready',
      terminal: 'pty-C',
      title: 'Terminal',
      aiVaultTitle: undefined,
      generatedTitle: undefined,
      agentStatus: undefined
    }
    const [mirroredC] = buildMirroredTerminalTabs(
      { ...baseSnapshot, snapshotVersion: 10, tabs: [surfaceShellC] },
      'dbox',
      existingById,
      existingLayouts,
      {},
      0,
      2_300
    )
    const shellPatchC = buildMirroredAgentStatusPatch(
      useAppStore.getState(),
      [mirroredA.tab],
      [surfaceShellC],
      [mirroredC],
      'dbox',
      wt.id,
      new Set(),
      2_300
    )
    useAppStore.setState({
      ...shellPatchC,
      tabsByWorktree: { [wt.id]: [mirroredC.tab] },
      terminalLayoutsByTabId: { [mirroredC.tab.id]: mirroredC.layout }
    })
    expect(useAppStore.getState().agentStatusByPaneKey.get(paneKey)).toBeUndefined()
    expect(useAppStore.getState().agentConversationsByPaneKey[paneKey]).toBeUndefined()

    // Live client-owned OSC row fences same-session and restoredUnconfirmed host snapshots, but yields to confirmed new session B.
    const releaseFence = registerRendererOwnedAgentStatusPane(paneKey, 'dbox')
    try {
      useAppStore.setState({
        tabsByWorktree: { [wt.id]: [mirroredA.tab] },
        terminalLayoutsByTabId: { [mirroredA.tab.id]: mirroredA.layout },
        agentStatusByPaneKey: initialState.agentStatusByPaneKey,
        agentConversationsByPaneKey: {}
      })
      const surfaceAWorking: RuntimeMobileSessionTerminalClientTab = {
        ...surfaceA,
        agentStatus: {
          ...surfaceA.agentStatus!,
          state: 'working',
          stateStartedAt: 2_500,
          updatedAt: 2_500
        }
      }
      const warmWorkingPatchA = buildMirroredAgentStatusPatch(
        useAppStore.getState(),
        [mirroredA.tab],
        [surfaceAWorking],
        [mirroredA],
        'dbox',
        wt.id,
        new Set(),
        2_500
      )
      useAppStore.setState(warmWorkingPatchA!)
      markRendererOwnedAgentStatusWrite(paneKey)
      act(() => {
        useAppStore
          .getState()
          .setAgentStatus(
            paneKey,
            { state: 'working', prompt: '你执行啊', agentType: 'claude', sessionBoundary: false },
            '✳ Claude Code',
            { updatedAt: 3_000, stateStartedAt: 3_000 },
            { worktreeId: wt.id, tabId: mirroredA.tab.id, connectionId: null }
          )
      })
      expect(
        useAppStore.getState().agentStatusByPaneKey.get(paneKey)?.mirroredEvidenceReceivedAt
      ).toBeUndefined()
      expect(useAppStore.getState().agentStatusByPaneKey.get(paneKey)?.providerSession?.id).toBe(
        'A'
      )

      // Same session A from host (even with sessionBoundary: true) stays behind the fresh client byte fence.
      const sameSessionHostPatch = buildMirroredAgentStatusPatch(
        useAppStore.getState(),
        [mirroredA.tab],
        [
          {
            ...surfaceA,
            agentStatus: {
              ...surfaceA.agentStatus!,
              state: 'working',
              sessionBoundary: true,
              stateStartedAt: 3_100,
              updatedAt: 3_100
            }
          }
        ],
        [mirroredA],
        'dbox',
        wt.id,
        new Set(),
        3_100
      )
      if (sameSessionHostPatch) {
        useAppStore.setState(sameSessionHostPatch)
      }
      expect(useAppStore.getState().agentStatusByPaneKey.get(paneKey)?.prompt).toBe('你执行啊')
      expect(useAppStore.getState().agentStatusByPaneKey.get(paneKey)?.providerSession?.id).toBe(
        'A'
      )

      // Unconfirmed restored snapshot for B never pierces client OSC authority; confirmed B does.
      const surfaceSessionB: RuntimeMobileSessionTerminalClientTab = {
        ...surfaceA,
        agentStatus: {
          ...surfaceA.agentStatus!,
          state: 'working',
          prompt: '开始处理新会话 B 任务',
          sessionBoundary: true,
          stateStartedAt: 3_200,
          updatedAt: 3_200,
          providerSession: { key: 'session_id', id: 'B' }
        }
      }
      for (const unconfirmedBoundary of [false, true]) {
        const unconfirmedReplayPatch = buildMirroredAgentStatusPatch(
          useAppStore.getState(),
          [mirroredA.tab],
          [
            {
              ...surfaceSessionB,
              agentStatus: {
                ...surfaceSessionB.agentStatus!,
                restoredUnconfirmed: true,
                sessionBoundary: unconfirmedBoundary,
                stateStartedAt: 500,
                updatedAt: 500
              }
            }
          ],
          [mirroredA],
          'dbox',
          wt.id,
          new Set(),
          3_150
        )
        const rowAfterUnconfirmed = (
          unconfirmedReplayPatch?.agentStatusByPaneKey ??
          useAppStore.getState().agentStatusByPaneKey
        ).get(paneKey)
        expect(rowAfterUnconfirmed?.providerSession?.id).toBe('A')
        expect(rowAfterUnconfirmed?.prompt).toBe('你执行啊')
      }

      const sessionBHostPatch = buildMirroredAgentStatusPatch(
        useAppStore.getState(),
        [mirroredA.tab],
        [surfaceSessionB],
        [mirroredA],
        'dbox',
        wt.id,
        new Set(),
        3_200
      )
      useAppStore.setState(sessionBHostPatch!)
      expect(useAppStore.getState().agentStatusByPaneKey.get(paneKey)?.providerSession?.id).toBe(
        'B'
      )
      expect(useAppStore.getState().agentStatusByPaneKey.get(paneKey)?.prompt).toBe(
        '开始处理新会话 B 任务'
      )
      expect(useAppStore.getState().agentConversationsByPaneKey[paneKey]?.providerSession?.id).toBe(
        'B'
      )

      // Stale idle SessionStart carrying a session id does not wipe an unowned working OSC turn, while SessionEnd (clear) still supersedes.
      expect(
        hostAgentStatusSupersedesClientSession(
          { agentType: 'claude', state: 'working', providerSession: undefined },
          {
            agentType: 'claude',
            state: 'done',
            sessionBoundary: true,
            providerSession: { key: 'session_id', id: 'A' }
          }
        )
      ).toBe(false)
      expect(
        hostAgentStatusSupersedesClientSession(
          { agentType: 'claude', state: 'working', providerSession: undefined },
          { agentType: 'claude', state: 'done', sessionBoundary: true, providerSession: undefined }
        )
      ).toBe(true)

      // Cross-provider collision with identical key/id still supersedes when confirmed, and yields when restoredUnconfirmed.
      expect(
        hostAgentStatusSupersedesClientSession(
          { agentType: 'claude', providerSession: { key: 'session_id', id: 'shared-1' } },
          { agentType: 'codex', providerSession: { key: 'session_id', id: 'shared-1' } }
        )
      ).toBe(true)
      expect(
        hostAgentStatusSupersedesClientSession(
          { agentType: 'claude', providerSession: { key: 'session_id', id: 'shared-1' } },
          {
            agentType: 'codex',
            providerSession: { key: 'session_id', id: 'shared-1' },
            restoredUnconfirmed: true
          }
        )
      ).toBe(false)
      expect(
        mirroredSessionNameOwnership(
          {
            leafId: LEAF_1,
            aiVaultTitle: slotA,
            agentStatus: {
              ...surfaceA.agentStatus!,
              agentType: 'codex',
              providerSession: { key: 'session_id', id: 'A' }
            }
          },
          slotA,
          LEAF_1,
          true
        )
      ).toEqual({
        retainPreviousName: false,
        sessionTitle: null,
        hostSlotConflicts: true
      })
    } finally {
      releaseFence()
    }
  })
})
