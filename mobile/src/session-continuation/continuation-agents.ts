import { TERMINAL_PROMPT_DELIVERY_RUNTIME_CAPABILITY } from '../../../src/shared/protocol-version'

/** Phase one ships claude and codex only: both fold a prompt into argv, and both were
 *  verified end to end on a real host. Agents whose prompt must be typed after startup
 *  need their own readiness evidence first. */
export const MOBILE_SESSION_CONTINUATION_AGENTS = ['claude', 'codex'] as const

export type MobileSessionContinuationAgent = (typeof MOBILE_SESSION_CONTINUATION_AGENTS)[number]

export function isMobileSessionContinuationAgent(
  value: string | null | undefined
): value is MobileSessionContinuationAgent {
  return value === 'claude' || value === 'codex'
}

/** Why this capability: continuation reads `waitSubmitMs` and the submission stages off
 *  `terminal.send`. Older hosts strip both, leaving the delivery unreadable, so the entry
 *  stays hidden instead of reporting an outcome it cannot observe. */
export function supportsMobileSessionContinuation(
  capabilities: readonly string[] | undefined
): boolean {
  return capabilities?.includes(TERMINAL_PROMPT_DELIVERY_RUNTIME_CAPABILITY) === true
}
