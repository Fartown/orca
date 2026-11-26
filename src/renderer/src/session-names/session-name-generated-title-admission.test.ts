import { describe, expect, it } from 'vitest'
import { getDefaultSettings } from '../../../shared/orca-profiles/constants'
import { makePaneKey } from '../../../shared/workspace-layout/stable-pane-id'
import type { Tab } from '../../../shared/workspace-layout/tab-groups/tab-types'
import type { TerminalTab } from '../../../shared/workspace-layout/terminal-tab-types'
import { resolveTerminalTabTitle } from '../../../shared/workspace-layout/tab-groups/tab-title-resolution'
import { applyGeneratedTabTitleUpdates } from '../store/terminals/tabs/presentation/terminal-tab-title-batch'

// Ported from the fork's store tests after upstream removed them (#38223, #39508).

const LEAF_ID = '11111111-1111-4111-8111-111111111111'
const PANE_KEY = makePaneKey('tab-1', LEAF_ID)

type TitleState = Parameters<typeof applyGeneratedTabTitleUpdates>[0]

function terminalTab(overrides: Partial<TerminalTab>): TerminalTab {
  return {
    id: 'tab-1',
    worktreeId: 'owner',
    ptyId: null,
    title: 'Terminal 1',
    customTitle: null,
    color: null,
    sortOrder: 0,
    createdAt: 1,
    ...overrides
  }
}

function unifiedTab(overrides: Partial<Tab>): Tab {
  return {
    id: 'tab-1',
    entityId: 'tab-1',
    groupId: 'group-1',
    worktreeId: 'owner',
    contentType: 'terminal',
    label: 'Terminal 1',
    customLabel: null,
    color: null,
    sortOrder: 0,
    createdAt: 1,
    ...overrides
  }
}

function titleState(tab: TerminalTab, unified: Tab): TitleState {
  return {
    activeWorktreeId: 'owner',
    settings: { ...getDefaultSettings('/tmp'), tabAutoGenerateTitle: true },
    sortEpoch: 0,
    tabsByWorktree: { owner: [tab] },
    unifiedTabsByWorktree: { owner: [unified] }
  }
}

function write(state: TitleState, prompt: string): TitleState {
  const { patch } = applyGeneratedTabTitleUpdates(state, [{ paneKey: PANE_KEY, prompt }])
  return patch ? { ...state, ...patch } : state
}

describe('stable first task admission', () => {
  it('captures a valid task past an old low-information name and labels', () => {
    let state = titleState(
      terminalTab({
        generatedTitle: '继续',
        customTitle: 'Container label',
        quickCommandLabel: 'Launch label'
      }),
      unifiedTab({ generatedLabel: '继续' })
    )
    state = write(state, '运行测试')
    expect(state.tabsByWorktree.owner?.[0].generatedTitle).toBe('运行测试')
    expect(state.unifiedTabsByWorktree.owner?.[0].generatedLabel).toBe('运行测试')
    state = write(state, '继续')
    state = write(state, '修复另一个问题')
    expect(state.tabsByWorktree.owner?.[0].generatedTitle).toBe('运行测试')
    expect(state.tabsByWorktree.owner?.[0].customTitle).toBe('Container label')
  })

  it('keeps a paired host’s identity fallback visible when the client receives a follow-up prompt', () => {
    const state = titleState(
      terminalTab({
        title: 'Claude Code',
        defaultTitle: 'Terminal',
        launchAgent: 'claude',
        sessionTitleFromHost: true,
        aiVaultTitle: {
          agent: 'claude',
          sessionId: 'session-a',
          title: 'Claude session-',
          providerName: { kind: 'absent' }
        }
      }),
      unifiedTab({})
    )
    const next = write(state, 'Compare the results again')
    expect(resolveTerminalTabTitle(next.tabsByWorktree.owner[0], true)).toBe('Claude session-')
  })

  it('uses the focused split task when a background prompt arrives first in the same batch', () => {
    const otherLeaf = '22222222-2222-4222-8222-222222222222'
    const state = {
      ...titleState(terminalTab({ launchAgent: 'claude' }), unifiedTab({})),
      terminalLayoutsByTabId: {
        'tab-1': {
          root: {
            type: 'split' as const,
            direction: 'horizontal' as const,
            ratio: 0.5,
            first: { type: 'leaf' as const, leafId: LEAF_ID },
            second: { type: 'leaf' as const, leafId: otherLeaf }
          },
          activeLeafId: LEAF_ID,
          expandedLeafId: null
        }
      }
    }
    const { patch } = applyGeneratedTabTitleUpdates(state, [
      { paneKey: makePaneKey('tab-1', otherLeaf), prompt: 'Investigate background lint' },
      { paneKey: PANE_KEY, prompt: 'Investigate foreground build' }
    ])
    expect(resolveTerminalTabTitle(patch!.tabsByWorktree!.owner[0], true)).toBe(
      'Investigate foreground build'
    )
  })

  it('prefers the agent task over a quick command container label', () => {
    const state = write(
      titleState(terminalTab({ quickCommandLabel: 'Run tests' }), unifiedTab({})),
      'Fix the flaky status tests'
    )
    const tab = state.tabsByWorktree.owner![0]
    expect(tab.generatedTitle).toBe('Fix the flaky status tests')
    // A plain terminal keeps its quick-command label; an agent tab names its session first.
    expect(resolveTerminalTabTitle(tab, true)).toBe('Run tests')
    expect(resolveTerminalTabTitle({ ...tab, launchAgent: 'claude' }, true)).toBe(
      'Fix the flaky status tests'
    )
  })
})
