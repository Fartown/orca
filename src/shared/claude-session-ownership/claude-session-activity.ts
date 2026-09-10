import type { AgentHookEventPayload } from '../agent-hook-listener/listener-event'
import type { HookListenerState } from '../agent-hook-listener/listener-state'

export const CLAUDE_SESSION_ACTIVITY_WINDOW_MS = 30_000

export type ClaudeSessionActivity = { sessionId: string; observedAt: number }

export function shouldRejectClaudeSessionReplacement(
  state: HookListenerState,
  paneKey: string,
  sessionId: string | undefined
): boolean {
  if (!sessionId) {
    return false
  }
  const previous = state.lastStatusByPaneKey.get(paneKey)
  const incumbent = previous?.providerSession?.id
  const activity = state.claudeSessionActivityByPaneKey.get(paneKey)
  if (
    previous?.payload.agentType !== 'claude' ||
    !incumbent ||
    incumbent === sessionId ||
    activity?.sessionId !== incumbent
  ) {
    return false
  }
  return performance.now() - activity.observedAt < CLAUDE_SESSION_ACTIVITY_WINDOW_MS
}

export function recordClaudeSessionActivity(
  state: HookListenerState,
  event: AgentHookEventPayload,
  isReplay = event.isReplay
): void {
  if (isReplay || event.source !== 'claude' || !event.hookEventName || !event.providerSession) {
    return
  }
  state.claudeSessionActivityByPaneKey.set(event.paneKey, {
    sessionId: event.providerSession.id,
    observedAt: performance.now()
  })
}
