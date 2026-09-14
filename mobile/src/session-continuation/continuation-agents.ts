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

// Deliberately no host-capability gate: every method this feature calls
// (session.tabs.createTerminal, terminal.wait, terminal.send) has been on the mobile allowlist
// since the repository's early history, and `cwd` is an existing optional field an older host
// simply strips — the new terminal then starts at the workspace root, which the prompt still
// names. Nothing here reads a field a pre-capability host would remove.
