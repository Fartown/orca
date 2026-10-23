import { describe, expect, it } from 'vitest'
import { rowConversationName } from '../components/dashboard/dashboard-card-labels'
import type { DashboardAgentRow } from '../components/dashboard/useDashboardData'

const row = {
  paneKey: 'tab:leaf',
  agentType: 'codex',
  entry: { providerSession: { id: 'own-session' } },
  tab: {
    id: 'tab',
    worktreeId: 'wt',
    customTitle: null,
    title: 'Live own task',
    aiVaultTitle: {
      agent: 'codex',
      sessionId: 'sibling-session',
      title: 'Sibling native name',
      providerName: { kind: 'named', title: 'Sibling native name', field: 'test.nativeName' }
    }
  }
} as unknown as DashboardAgentRow

describe('dashboard session title ownership', () => {
  it('does not reuse a different session name from its shared tab', () => {
    expect(rowConversationName(row, true, undefined, undefined)).toBe('Live own task')
  })
  it('uses native evidence when the row owns it', () => {
    expect(
      rowConversationName(
        {
          ...row,
          tab: { ...row.tab, aiVaultTitle: { ...row.tab.aiVaultTitle!, sessionId: 'own-session' } }
        },
        true,
        undefined,
        undefined
      )
    ).toBe('Sibling native name')
  })
  it('does not let synthetic children inherit the parent slot', () => {
    expect(
      rowConversationName({ ...row, rowSource: 'subagent' }, true, undefined, undefined)
    ).toBeUndefined()
  })
})
