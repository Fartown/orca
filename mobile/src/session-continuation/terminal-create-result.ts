import type { MobileQuickCommandLaunch } from '../terminal/quick-commands'
/** What a create settled as, so a caller that must act on the new terminal (session
 *  continuation waits on its readiness) can address it instead of re-deriving the handle. */
export type MobileTerminalCreateResult =
  | { kind: 'terminal'; handle: string }
  /** The tab was created and selected, but the reply carried no terminal handle — callers that
   *  must address the terminal have to treat this as "session exists, cannot write to it". */
  | { kind: 'terminal-without-handle' }
  | { kind: 'structured'; sessionId: string }
  | null

export type MobileTerminalCreateOptions = MobileQuickCommandLaunch['options'] & {
  onPromptSent?: () => void
  errorToast?: string
  /** Directory for the new terminal; a continuation reuses the source session's cwd. */
  cwd?: string
  /** Reuse an idempotency key across retries of the same logical create, so a retry after an
   *  ambiguous failure resolves to the in-flight terminal instead of spawning a sibling. */
  clientMutationId?: string
  sourceChatFork?: { sessionId: string; agent: string }
}

export type CreateOutcome = 'created' | 'accepted' | 'busy' | 'unavailable' | 'reported-failure'
