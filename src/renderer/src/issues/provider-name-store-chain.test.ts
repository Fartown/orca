import { describe, expect, it, vi } from 'vitest'
import { createTerminalTabPresentationActions } from '../store/terminals/terminal-tab-presentation'
import type { AppState } from '../store/types'
import { parseWorkspaceSession } from '../../../shared/workspace-session-schema'
import {
  resolveTerminalTabTitle,
  resolveUnifiedTabLabel
} from '../../../shared/tab-title-resolution'

vi.mock('@/runtime/sync-runtime-graph', () => ({ scheduleRuntimeGraphSync: vi.fn() }))

describe('real title store and workspace serialization seams', () => {
  it('preserves evidence-only changes in both tab models and through restart parsing', () => {
    const legacy = {
      agent: 'codex' as const,
      sessionId: 'session',
      title: '继续',
      source: 'provider' as const
    }
    let state = {
      activeRepoId: null,
      activeWorktreeId: 'wt',
      activeTabId: 'tab',
      tabsByWorktree: {
        wt: [
          {
            id: 'tab',
            worktreeId: 'wt',
            ptyId: null,
            title: 'Live step',
            customTitle: 'Container',
            color: null,
            sortOrder: 0,
            createdAt: 1,
            aiVaultTitle: legacy
          }
        ]
      },
      unifiedTabsByWorktree: {
        wt: [
          {
            id: 'unified',
            groupId: 'group',
            worktreeId: 'wt',
            contentType: 'terminal',
            entityId: 'tab',
            label: 'Live step',
            customLabel: 'Container',
            color: null,
            sortOrder: 0,
            createdAt: 1,
            aiVaultTitle: legacy
          }
        ]
      },
      terminalLayoutsByTabId: {}
    } as unknown as AppState
    const actions = createTerminalTabPresentationActions(
      (update) => {
        const patch = typeof update === 'function' ? update(state) : update
        state = { ...state, ...patch }
      },
      () => state
    )
    const native = {
      ...legacy,
      providerName: { kind: 'named' as const, title: '继续', field: 'session_index.thread_name' },
      generatedTitle: '运行测试',
      manualTitle: 'Old manual'
    }
    actions.setAiVaultTabTitle('tab', native)
    expect(state.tabsByWorktree.wt[0].aiVaultTitle).toEqual(native)
    expect(state.unifiedTabsByWorktree.wt[0].aiVaultTitle).toEqual(native)
    const restored = parseWorkspaceSession(
      JSON.parse(JSON.stringify({ ...state, unifiedTabs: state.unifiedTabsByWorktree }))
    )
    expect(restored.ok).toBe(true)
    if (!restored.ok) {
      throw new Error(restored.error)
    }
    expect(restored.value.tabsByWorktree.wt[0].aiVaultTitle).toEqual(native)
    expect(restored.value.unifiedTabs?.wt[0].aiVaultTitle).toEqual(native)
    expect(resolveTerminalTabTitle(restored.value.tabsByWorktree.wt[0], false)).toBe('继续')
    expect(resolveUnifiedTabLabel(restored.value.unifiedTabs?.wt[0], false)).toBe('继续')
  })
})
