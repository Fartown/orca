import { MOBILE_TUI_AGENT_LABELS } from '../tasks/mobile-tui-agents'
import type { MobileSessionContinuationAgent } from './continuation-agents'

/** Mobile has no i18n catalog yet, so these stay inline English. Each line mirrors a
 *  desktop `components.agentSessionContinuation.*` key so the two surfaces read alike. */
export const CONTINUATION_COPY = {
  menuLabel: 'Continue in New Session…',
  sheetTitleFallback: 'Current session',
  originalAgent: (agent: MobileSessionContinuationAgent): string =>
    `Original agent: ${MOBILE_TUI_AGENT_LABELS[agent]}`,
  /** Named after the mode the row switches *to*; the hint describes the mode in effect now. */
  switchToFull: 'Switch to full session transcript',
  switchToFocused: 'Switch to focused handoff',
  modeFocusedHint:
    'Now: focused handoff — uses the latest status and current workspace, reading older transcript details only when needed.',
  modeFullHint:
    'Now: full session transcript — the new Agent reads the complete saved session first. This can take longer and use more of your plan.',
  continueWith: (agent: MobileSessionContinuationAgent): string =>
    `Continue with ${MOBILE_TUI_AGENT_LABELS[agent]}`,
  continueWithHint: 'Starts a new session in this workspace',
  detecting: 'Detecting Agents…',
  noAgents: 'No Claude or Codex detected on this workspace host',
  detectFailed: 'Could not detect Agents on this workspace host',
  sent: (agent: MobileSessionContinuationAgent): string =>
    `Session context sent to ${MOBILE_TUI_AGENT_LABELS[agent]} in a new session.`,
  launchFailed: (agent: MobileSessionContinuationAgent): string =>
    `Could not start a new ${MOBILE_TUI_AGENT_LABELS[agent]} session.`,
  deliveryFailed: (agent: MobileSessionContinuationAgent): string =>
    `The new ${MOBILE_TUI_AGENT_LABELS[agent]} session started, but its context could not be sent.`,
  noContext: 'No session context is available to continue in a new session.',
  deliveryUnknown: 'The context may have been sent. Check the new session.',
  busy: 'Another continuation is still starting.'
} as const
