import { describe, expect, it } from 'vitest'
import type { AgentStatusIpcPayload } from '../../shared/agent-status-types'
import { projectTurnEvidence } from './goal-turn-evidence'

function row(overrides: Partial<AgentStatusIpcPayload>): AgentStatusIpcPayload {
  return {
    paneKey: 'tab:leaf',
    connectionId: null,
    receivedAt: 1,
    stateStartedAt: 1,
    state: 'working',
    prompt: '',
    updatedAt: 1,
    ...overrides
  } as AgentStatusIpcPayload
}

describe('projectTurnEvidence', () => {
  it('reports unknown without hook rows', () => {
    expect(projectTurnEvidence([])).toEqual({
      agentStatus: null,
      turn: 'unknown',
      stateStartedAt: null
    })
  })

  it('takes the newest state and treats done as the only finished turn', () => {
    expect(
      projectTurnEvidence([
        row({ state: 'done', stateStartedAt: 10 }),
        row({ state: 'working', stateStartedAt: 20 })
      ])
    ).toEqual({ agentStatus: 'working', turn: 'running', stateStartedAt: 20 })
    expect(projectTurnEvidence([row({ state: 'done', stateStartedAt: 30 })]).turn).toBe('finished')
    expect(projectTurnEvidence([row({ state: 'waiting', stateStartedAt: 30 })]).turn).toBe(
      'running'
    )
  })

  it('ignores resume-identity rows that carry no status', () => {
    expect(
      projectTurnEvidence([row({ state: 'done', stateStartedAt: 99, providerSessionOnly: true })])
    ).toEqual({ agentStatus: null, turn: 'unknown', stateStartedAt: null })
  })
})
