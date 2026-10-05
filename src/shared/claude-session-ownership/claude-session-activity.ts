import type { AgentHookEventPayload } from '../agent-hook-listener/listener-event'
import type { HookListenerState } from '../agent-hook-listener/listener-state'
import {
  isSameAgentProcess,
  readAgentProcessIdentity,
  type AgentProcessIdentity
} from '../agent-process-presence'

export const CLAUDE_SESSION_ACTIVITY_WINDOW_MS = 30_000

export type ClaudeSessionActivity = { sessionId: string; observedAt: number }

export function shouldRejectClaudeSessionReplacement(
  state: HookListenerState,
  paneKey: string,
  sessionId: string | undefined,
  senderProcess?: AgentProcessIdentity
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
  // Why: an exited owner has nothing left to protect, and the owner's own process switching
  // sessions (/clear, /resume) is the user's switch, not a background call.
  const owner = previous.agentPresence
  if (
    owner?.ended ||
    (senderProcess && owner?.process && isSameAgentProcess(senderProcess, owner.process))
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

/**
 * A refused Claude hook still proves another process reports from the pane, which is what casts
 * doubt on the owner; without the probe a dead owner would keep refusing its own relaunch.
 */
export function checkOwnerAfterRefusedClaudeHook(
  state: HookListenerState,
  body: unknown,
  checkOwner: (paneKey: string) => unknown
): void {
  if (typeof body !== 'object' || body === null || !('paneKey' in body)) {
    return
  }
  const paneKey = typeof body.paneKey === 'string' ? body.paneKey.trim() : ''
  const sender = readAgentProcessIdentity('agentProcess' in body ? body.agentProcess : undefined)
  const owner = paneKey ? state.lastStatusByPaneKey.get(paneKey)?.agentPresence : undefined
  if (sender && owner?.process && !owner.ended && !isSameAgentProcess(sender, owner.process)) {
    void checkOwner(paneKey)
  }
}
