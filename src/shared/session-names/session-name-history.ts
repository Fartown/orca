import type { AgentStateHistoryEntry, AgentStatusEntry } from '../agent-status-types'
import { AGENT_STATE_HISTORY_MAX } from '../agent-status-types'
import { structuralValuesEqualIgnoringUndefined } from '../structural-value-equality'

export function isSessionNameIdentityReplacement(
  previous: Pick<AgentStatusEntry, 'agentType' | 'providerSession'> | undefined,
  agent: AgentStatusEntry['agentType'],
  session: AgentStatusEntry['providerSession']
): boolean {
  return Boolean(
    previous?.providerSession &&
    session &&
    (previous.providerSession.id !== session.id ||
      (agent && agent !== 'unknown' && agent !== previous.agentType))
  )
}

export function sessionNameStateStartedAt(
  previous: AgentStatusEntry | undefined,
  agent: AgentStatusEntry['agentType'],
  session: AgentStatusEntry['providerSession'],
  state: AgentStatusEntry['state'],
  hostStartedAt: number | undefined,
  updatedAt: number
): number | undefined {
  if (!previous || hostStartedAt === undefined) {
    return hostStartedAt
  }
  if (isSessionNameIdentityReplacement(previous, agent, session)) {
    return hostStartedAt <= previous.stateStartedAt ? updatedAt : hostStartedAt
  }
  // Older hosts may keep replaying A's clock after the renderer has accepted B.
  const repeatsOldSessionClock =
    previous.state === state &&
    hostStartedAt < previous.stateStartedAt &&
    previous.stateHistory.some(
      (entry) =>
        entry.startedAt === hostStartedAt &&
        isSessionNameIdentityReplacement(entry.sessionName, agent, session)
    )
  return repeatsOldSessionClock ? previous.stateStartedAt : hostStartedAt
}

export function captureSessionNameHistory(
  entry: AgentStatusEntry
): AgentStateHistoryEntry['sessionName'] {
  return {
    agentType: entry.agentType,
    providerSession: entry.providerSession ? { ...entry.providerSession } : undefined,
    terminalTitle: entry.terminalTitle,
    connectionId: entry.connectionId
  }
}

export function appendSessionNameHistory(entry: AgentStatusEntry): AgentStateHistoryEntry[] {
  return [
    ...entry.stateHistory,
    {
      state: entry.state,
      sessionName: captureSessionNameHistory(entry),
      prompt: entry.prompt,
      startedAt: entry.stateStartedAt,
      interrupted: entry.interrupted
    }
  ].slice(-AGENT_STATE_HISTORY_MAX)
}

export function sessionNameHistoryEqual(
  a: AgentStateHistoryEntry['sessionName'],
  b: AgentStateHistoryEntry['sessionName']
): boolean {
  return structuralValuesEqualIgnoringUndefined(a, b)
}

export function sessionNameHistorySnapshot(history: AgentStateHistoryEntry) {
  return {
    agentType: history.sessionName?.agentType,
    providerSession: history.sessionName?.providerSession,
    terminalTitle: history.sessionName?.terminalTitle,
    connectionId: history.sessionName?.connectionId,
    orchestration: undefined,
    subagents: undefined,
    model: undefined,
    lastCompletedAssistantMessage: undefined
  }
}
