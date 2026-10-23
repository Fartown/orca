// @vitest-environment happy-dom

import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  useTabGroupItemProjections,
  type TabGroupWorktreeSnapshot
} from '../components/tab-group/useTabGroupItemProjections'
import { resolveTerminalTabTitle } from '../../../shared/tab-title-resolution'
import { getAgentRowConversationName } from '../../../shared/agent-row-conversation-name'
import type { AiVaultSessionTitle } from '../../../shared/ai-vault-session-title'

afterEach(cleanup)

function snapshot(title: string, generatedTitle: string): TabGroupWorktreeSnapshot {
  const aiVaultTitle: AiVaultSessionTitle = {
    agent: 'codex',
    sessionId: 'session-a',
    title,
    source: 'provider'
  }
  return {
    groups: [
      { id: 'group', worktreeId: 'workspace', activeTabId: 'unified', tabOrder: ['unified'] }
    ],
    unifiedTabs: [
      {
        id: 'unified',
        entityId: 'terminal',
        groupId: 'group',
        worktreeId: 'workspace',
        contentType: 'terminal',
        label: 'Codex working',
        generatedLabel: generatedTitle,
        aiVaultTitle,
        customLabel: null,
        color: null,
        sortOrder: 0,
        createdAt: 0
      }
    ],
    terminalTabs: [
      {
        id: 'terminal',
        ptyId: 'pty',
        worktreeId: 'workspace',
        title: 'Codex working',
        generatedTitle,
        aiVaultTitle,
        launchAgent: 'codex',
        customTitle: null,
        color: null,
        sortOrder: 0,
        createdAt: 0
      }
    ],
    openFiles: [],
    browserTabs: [],
    expandedPaneByTabId: {},
    terminalLayoutsByTabId: {},
    generatedTabTitlesEnabled: true,
    mobileEmulatorEnabled: false
  }
}

function project(worktreeState: TabGroupWorktreeSnapshot) {
  return renderHook(() =>
    useTabGroupItemProjections({
      worktreeState,
      groupId: 'group',
      worktreeId: 'workspace'
    })
  ).result.current.terminalTabs[0]!
}

describe('Provider title survives grouped tab rendering', () => {
  it.each([
    ['Continue Orca session', 'Continue work from the prior Orca'],
    ['Read prior Orca session', '继续']
  ])('renders %s in both the sidebar and final tab strip', (providerTitle, generatedTitle) => {
    const state = snapshot(providerTitle, generatedTitle)
    const tab = project(state)
    expect(getAgentRowConversationName(state.terminalTabs[0]!, 'codex', true)).toBe(providerTitle)
    // The tab strip resolves again after the group's projection.
    expect(resolveTerminalTabTitle(tab, true, tab.title)).toBe(providerTitle)
    expect(tab.aiVaultTitle).toEqual(state.terminalTabs[0]!.aiVaultTitle)
  })

  it.each(['terminal', 'unified'] as const)(
    'preserves a slot present only in the %s model',
    (model) => {
      const state = snapshot('Provider name', 'Prompt fallback')
      if (model === 'terminal') {
        state.unifiedTabs[0]!.aiVaultTitle = undefined
      } else {
        state.terminalTabs[0]!.aiVaultTitle = undefined
      }
      const tab = project(state)
      expect(resolveTerminalTabTitle(tab, true, tab.title)).toBe('Provider name')
    }
  )

  it('still uses the generated fallback when neither model has a provider title', () => {
    const state = snapshot('Provider name', 'Prompt fallback')
    state.unifiedTabs[0]!.aiVaultTitle = undefined
    state.terminalTabs[0]!.aiVaultTitle = undefined
    const tab = project(state)
    expect(resolveTerminalTabTitle(tab, true, tab.title)).toBe('Prompt fallback')
  })

  it('honors an explicit backing-tab clear instead of reviving a stale unified slot', () => {
    const state = snapshot('Stale provider name', 'Prompt fallback')
    state.terminalTabs[0]!.aiVaultTitle = null
    const tab = project(state)
    expect(tab.aiVaultTitle).toBeNull()
    expect(resolveTerminalTabTitle(tab, true, tab.title)).toBe('Prompt fallback')
  })

  it('uses the backing-tab provider slot shared with the sidebar when the mirror lags', () => {
    const state = snapshot('Stale provider name', 'Prompt fallback')
    state.terminalTabs[0]!.aiVaultTitle = {
      agent: 'codex',
      sessionId: 'session-b',
      title: 'Current provider name',
      source: 'provider'
    }
    const tab = project(state)
    expect(tab.aiVaultTitle?.sessionId).toBe('session-b')
    expect(resolveTerminalTabTitle(tab, true, tab.title)).toBe(
      getAgentRowConversationName(state.terminalTabs[0]!, 'codex', true)
    )
    expect(resolveTerminalTabTitle(tab, false, tab.title)).toBe('Current provider name')
  })
})
