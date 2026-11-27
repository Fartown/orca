/** What a create settled as, so a caller that must act on the new terminal (session
 *  continuation waits on its readiness) can address it instead of re-deriving the handle. */
export type MobileTerminalCreateResult =
  | { kind: 'terminal'; handle: string }
  /** The tab was created and selected, but the reply carried no terminal handle — callers that
   *  must address the terminal have to treat this as "session exists, cannot write to it". */
  | { kind: 'terminal-without-handle' }
  | null

/** Joined onto the shared create options, so the create action carries them without a fork type. */
export type MobileTerminalContinuationCreateOptions = {
  /** Directory for the new terminal; a continuation reuses the source session's cwd. */
  cwd?: string
  /** Reuse an idempotency key across retries of the same logical create, so a retry after an
   *  ambiguous failure resolves to the in-flight terminal instead of spawning a sibling. */
  clientMutationId?: string
  /** Hears the created tab's terminal handle, which is not a string when the reply carried none;
   *  setting it also keeps the create off `agent.launch`, whose reply names no terminal. */
  onCreateResult?: (terminalHandle: unknown) => void
}

type CreateTerminal<Agent> = (
  agent?: Agent,
  options?: MobileTerminalContinuationCreateOptions
) => Promise<unknown>

/** Runs the session's ordinary create and hands back what it made; null when it made nothing. */
export async function createMobileTerminalWithResult<Agent>(
  createTerminal: CreateTerminal<Agent>,
  agent: Agent,
  options: Omit<MobileTerminalContinuationCreateOptions, 'onCreateResult'>
): Promise<MobileTerminalCreateResult> {
  let result: MobileTerminalCreateResult = null
  await createTerminal(agent, {
    ...options,
    onCreateResult: (terminalHandle) => {
      result =
        typeof terminalHandle === 'string'
          ? { kind: 'terminal', handle: terminalHandle }
          : { kind: 'terminal-without-handle' }
    }
  })
  return result
}
