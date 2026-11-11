import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import { deriveGeneratedTabTitle } from '../../../shared/agent-tab-title'
import { getDefaultSettings } from '../../../shared/constants'
import type { LocalTaskSessionLink } from '../../../shared/local-tasks/local-task-link-types'
import { selectLocalTaskSessionTabLabel } from './local-task-session-tab-label'

const PANE = 'tab-9:leaf-1'
const link: LocalTaskSessionLink = {
  id: 's1',
  taskId: 't1',
  hostId: 'local',
  worktreeId: 'wt-1',
  instanceId: null,
  surface: 'terminal',
  tabId: 'tab-9',
  paneKey: PANE,
  sessionId: null,
  providerSession: null,
  agent: 'claude',
  linkedVia: 'manual',
  openedAt: 0
}

function status(overrides: Partial<AgentStatusEntry>): AgentStatusEntry {
  return {
    state: 'working',
    prompt: '',
    updatedAt: 1,
    stateStartedAt: 1,
    agentType: 'claude',
    paneKey: PANE,
    stateHistory: [],
    ...overrides
  }
}

function label(entry: AgentStatusEntry, generatedTitles: boolean): string | null {
  useAppStore.setState({
    agentStatusByPaneKey: { [PANE]: entry },
    settings: { ...getDefaultSettings('/home/test'), tabAutoGenerateTitle: generatedTitles }
  })
  return selectLocalTaskSessionTabLabel(useAppStore.getState(), link)
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true)
})

describe('a session row’s name when this window has no tab for it', () => {
  it('uses the title the agent set on its terminal', () => {
    expect(label(status({ terminalTitle: 'Fix the export header' }), false)).toBe(
      'Fix the export header'
    )
  })

  it('names it from the first prompt only where upstream would name the tab that way', () => {
    const entry = status({ terminalTitle: 'Claude Code', prompt: 'Export orders as CSV' })
    expect(label(entry, true)).toBe(deriveGeneratedTabTitle('Export orders as CSV'))
    expect(label(entry, true)).not.toBeNull()
    expect(label(entry, false)).toBeNull()
  })
})
