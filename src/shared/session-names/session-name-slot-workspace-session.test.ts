import { describe, expect, it } from 'vitest'
import { parseWorkspaceSession } from '../workspace-session/workspace-session-schema'

function terminalTab(aiVaultTitle: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'tab1',
    ptyId: null,
    worktreeId: 'wt',
    title: 'Codex',
    aiVaultTitle,
    customTitle: null,
    color: null,
    sortOrder: 0,
    createdAt: 0
  }
}

// Why: the restored tab title must keep which naming rule produced it, or a provider name and a
// conversation override would race again after restart.
describe('session name source in a restored workspace session', () => {
  it('keeps the title source on terminal tabs and unified tabs', () => {
    const result = parseWorkspaceSession({
      activeRepoId: null,
      activeWorktreeId: 'wt',
      activeTabId: 'tab1',
      tabsByWorktree: {
        wt: [
          terminalTab({
            agent: 'codex',
            sessionId: 'session-1',
            title: 'Provider thread name',
            source: 'provider'
          })
        ]
      },
      terminalLayoutsByTabId: {},
      unifiedTabs: {
        wt: [
          {
            id: 'tab1',
            entityId: 'tab1',
            groupId: 'group1',
            worktreeId: 'wt',
            contentType: 'terminal',
            label: 'Codex',
            aiVaultTitle: {
              agent: 'codex',
              sessionId: 'session-1',
              title: 'Provider thread name',
              source: 'conversation-override'
            },
            customLabel: null,
            color: null,
            sortOrder: 0,
            createdAt: 0
          }
        ]
      }
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.tabsByWorktree.wt[0].aiVaultTitle?.source).toBe('provider')
      expect(result.value.unifiedTabs?.wt[0].aiVaultTitle?.source).toBe('conversation-override')
    }
  })

  it('drops an unknown optional title source without dropping the title', () => {
    const result = parseWorkspaceSession({
      activeRepoId: null,
      activeWorktreeId: 'wt',
      activeTabId: 'tab1',
      tabsByWorktree: {
        wt: [
          terminalTab({
            agent: 'codex',
            sessionId: 'session-1',
            title: 'Provider thread name',
            source: 'future-source'
          })
        ]
      },
      terminalLayoutsByTabId: {}
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.tabsByWorktree.wt[0].aiVaultTitle).toMatchObject({
        title: 'Provider thread name',
        source: undefined
      })
    }
  })
})
