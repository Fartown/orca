import type { AgentStatusIpcPayload, AgentStatusState } from '../../shared/agent-status-types'
import type { GoalTurnState } from '../../shared/goals/goal-control-contract'

export type GoalTurnEvidence = {
  agentStatus: AgentStatusState | null
  turn: GoalTurnState
  stateStartedAt: number | null
}

/**
 * Projects the pane's hook rows (AgentHookServer.getStatusSnapshotForPane) into
 * the goal's turn facts. Resume-identity rows carry no status and are skipped;
 * of the rest the newest state wins. `waiting` and `blocked` are still an open
 * turn: the agent is parked on the user, not finished.
 */
export function projectTurnEvidence(rows: readonly AgentStatusIpcPayload[]): GoalTurnEvidence {
  let latest: AgentStatusIpcPayload | null = null
  for (const row of rows) {
    if (row.providerSessionOnly === true) {
      continue
    }
    if (!latest || row.stateStartedAt > latest.stateStartedAt) {
      latest = row
    }
  }
  if (!latest) {
    return { agentStatus: null, turn: 'unknown', stateStartedAt: null }
  }
  return {
    agentStatus: latest.state,
    turn: latest.state === 'done' ? 'finished' : 'running',
    stateStartedAt: latest.stateStartedAt
  }
}
