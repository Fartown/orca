import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import { findPaneForTerminalHandle, listGoalSessionCandidates } from './goal-session-target'

function entry(overrides: Partial<AgentStatusEntry>): AgentStatusEntry {
  return {
    state: 'working',
    prompt: '',
    updatedAt: 1,
    stateStartedAt: 1,
    paneKey: 'tab-1:leaf-1',
    stateHistory: [],
    ...overrides
  } as AgentStatusEntry
}

describe('listGoalSessionCandidates', () => {
  it('offers only hook-backed rows of the requested workspace', () => {
    const rows = {
      'tab-1:leaf-1': entry({ worktreeId: 'wt-a', agentType: 'claude', terminalHandle: 'term_a' }),
      'tab-2:leaf-2': entry({ paneKey: 'tab-2:leaf-2', worktreeId: 'wt-b' }),
      'tab-3:leaf-3': entry({
        paneKey: 'tab-3:leaf-3',
        worktreeId: 'wt-a',
        restoredUnconfirmed: true
      }),
      'tab-4:leaf-4': undefined
    }
    expect(listGoalSessionCandidates(rows, 'wt-a')).toEqual([
      {
        paneKey: 'tab-1:leaf-1',
        tabId: null,
        agentType: 'claude',
        title: null,
        state: 'working',
        terminalHandle: 'term_a'
      }
    ])
  })
})

describe('findPaneForTerminalHandle', () => {
  it('maps a bound handle back to its pane and prefers the stamped tab id', () => {
    const rows = {
      'tab-1:leaf-1': entry({ terminalHandle: 'term_a', tabId: 'tab-1' }),
      'tab-9:leaf-9': entry({ paneKey: 'tab-9:leaf-9', terminalHandle: 'term_b' })
    }
    expect(findPaneForTerminalHandle(rows, 'term_b')).toEqual({ tabId: 'tab-9', leafId: 'leaf-9' })
    expect(findPaneForTerminalHandle(rows, 'term_missing')).toBeNull()
  })
})
