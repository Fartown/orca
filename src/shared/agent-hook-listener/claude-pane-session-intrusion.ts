import type { AgentProviderSessionMetadata } from '../agent-session-resume'
import type { AgentHookEventPayload } from './listener-event'

/**
 * A second Claude process started inside a pane that is already running one takes
 * the pane's session identity away from the session the user is actually talking
 * to — Claude spawns these for its own work (recaps, title generation), and every
 * hook they emit carries their own `session_id` on the parent's pane.
 *
 * `SessionStart.source` cannot separate them: a genuine new agent tab reports
 * `startup` too. What does separate them is the pane itself — a user cannot swap
 * a pane's session while the session in it is mid-turn, so a different session id
 * arriving on a busy pane is an intruder. Once it is identified, every later event
 * from that id is suppressed as well, because the takeover otherwise just happens
 * on the intruder's next event instead.
 *
 * Panes the user really did point at a new session stay unaffected: those arrive
 * on a fresh pane, or on an idle one.
 */
export function isIntrudingClaudePaneSession(args: {
  paneKey: string
  previousStatus: AgentHookEventPayload | undefined
  providerSession: AgentProviderSessionMetadata | null | undefined
  suppressedSessionIdsByPaneKey: Map<string, string>
}): boolean {
  const incomingId = args.providerSession?.id
  if (!incomingId) {
    return false
  }
  if (args.suppressedSessionIdsByPaneKey.get(args.paneKey) === incomingId) {
    return true
  }
  const occupant = args.previousStatus
  const occupantId = occupant?.providerSession?.id
  if (!occupantId || occupantId === incomingId) {
    return false
  }
  // An idle occupant may legitimately be replaced: the user can start a new agent
  // in a pane whose previous one finished.
  if (occupant?.payload.state === 'done') {
    return false
  }
  args.suppressedSessionIdsByPaneKey.set(args.paneKey, incomingId)
  return true
}

/** The occupant itself changing session (compact, resume) must clear the suppression. */
export function releaseClaudePaneSessionSuppression(
  suppressedSessionIdsByPaneKey: Map<string, string>,
  paneKey: string,
  providerSessionId: string | undefined
): void {
  if (!providerSessionId) {
    return
  }
  if (suppressedSessionIdsByPaneKey.get(paneKey) !== providerSessionId) {
    suppressedSessionIdsByPaneKey.delete(paneKey)
  }
}
