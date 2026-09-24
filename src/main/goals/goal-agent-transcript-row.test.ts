import { describe, expect, it } from 'vitest'
import type { AgentStatusIpcPayload } from '../../shared/agent-status-ipc-payload'
import type { RuntimeWorktreePsSummary } from '../../shared/runtime-types'
import { attachRuntimeWorktreeAgentRows } from '../runtime/runtime-worktree-agent-rows'
import { collectRuntimeWorktreeAgentSources } from '../runtime/runtime-worktree-agent-sources'

/**
 * The Goal guard reads the working agent's transcript from its tail; worktree ps is how the
 * driver learns where it is. The path comes from the hook, on whichever host runs the agent.
 */
const WORKTREE_ID = 'repo-1::/workspace/app'

function rows(snapshot: Partial<AgentStatusIpcPayload>): RuntimeWorktreePsSummary['agents'] {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the row projection only reads worktreeId and writes agents and activity fields.
  const summary = {
    worktreeId: WORKTREE_ID,
    hasHostSidebarActivity: false,
    agents: []
  } as unknown as RuntimeWorktreePsSummary
  const snapshotRow: AgentStatusIpcPayload = {
    paneKey: 'tab-1:leaf-1',
    tabId: 'tab-1',
    worktreeId: WORKTREE_ID,
    connectionId: null,
    state: 'done',
    prompt: '【Goal 自动消息】继续推进目标。',
    agentType: 'claude',
    stateStartedAt: 10,
    receivedAt: 11,
    ...snapshot
  }
  const summaries = new Map([[WORKTREE_ID, summary]])
  attachRuntimeWorktreeAgentRows({
    summaries,
    pathIndex: {
      platformByRepoId: new Map(),
      posixAbsolute: new Map(),
      posixRelative: new Map(),
      windows: new Map(),
      windowsAbsolute: new Map()
    },
    missingWorktreeIds: new Set(),
    workingTerminalEvidenceByWorktreeId: new Map(),
    rowSources: collectRuntimeWorktreeAgentSources({
      mirroredWorktreeIdByTabId: new Map(),
      connectedPtyEvidence: {
        tabIds: new Set(['tab-1']),
        paneKeys: new Set(),
        ptyIdByTerminalHandle: new Map()
      },
      hookSnapshots: [snapshotRow]
    }),
    orchestrationByPaneKey: null,
    getSummary: (map, _paths, _missing, id) => map.get(id) ?? null
  })
  return summary.agents
}

describe('worktree ps agent rows', () => {
  it('carry the transcript path the hook reported', () => {
    const [row] = rows({
      providerSession: {
        key: 'session_id',
        id: 'abc',
        transcriptPath: '/home/me/.claude/projects/-workspace-app/abc.jsonl'
      }
    })
    expect(row.transcriptPath).toBe('/home/me/.claude/projects/-workspace-app/abc.jsonl')
    expect(row.prompt).toBe('【Goal 自动消息】继续推进目标。')
  })

  it('omit the field when the hook reported none, so old readers see the same row', () => {
    const [row] = rows({ providerSession: { key: 'session_id', id: 'abc' } })
    expect(row).not.toHaveProperty('transcriptPath')
  })
})
