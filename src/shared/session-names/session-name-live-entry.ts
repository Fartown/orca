import { resolveAgentStatusLiveEntryStateHistory } from '../agent-status-live-entry-state-history'
import type { AgentStatusEntry, ParsedAgentStatusPayload } from '../agent-status-types'
import { sessionNameEntryStateStartedAt, sessionNameIdentityReplaced } from './session-name-history'

/** A live row's state history, title and state clock, treating a provider session replacement as a state switch. */
export function resolveSessionNameLiveEntryState(
  existing: AgentStatusEntry | undefined,
  payload: Pick<ParsedAgentStatusPayload, 'state' | 'sessionBoundary' | 'agentType'>,
  metadata: Parameters<typeof sessionNameIdentityReplaced>[2],
  terminalTitle: string | undefined,
  updatedAt: number
) {
  const identityChanged = sessionNameIdentityReplaced(existing, payload, metadata)
  return {
    ...resolveAgentStatusLiveEntryStateHistory(existing, payload, updatedAt, identityChanged),
    terminalTitle: terminalTitle ?? (identityChanged ? undefined : existing?.terminalTitle),
    stateStartedAt: (hostStartedAt: number | undefined, newTurn: boolean): number =>
      sessionNameEntryStateStartedAt(
        existing,
        payload,
        metadata,
        hostStartedAt,
        updatedAt,
        newTurn || identityChanged
      )
  }
}
