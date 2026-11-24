import { useCallback } from 'react'
import {
  createMobileTerminalWithResult,
  type MobileTerminalContinuationCreateOptions
} from './terminal-create-result'
import type { RpcClient } from '../transport/rpc/rpc-client-contract'
import type { MobileSessionContinuationAgent } from './continuation-agents'
import type { MobileContinuationCreateResult } from './continuation-delivery'
import { useMobileSessionContinuation } from './use-mobile-session-continuation'

/** Adapter between the session controller's accumulated scope and the continuation hook, so the
 *  hook stays addressable by its own inputs (and testable without the whole controller). */
export function useMobileSessionContinuationScope(scope: {
  client: RpcClient | null
  worktreeId: string
  deviceTokenRef: { readonly current: string | null }
  showToast: (message: string, durationMs?: number) => void
  /** The session's ordinary create; continuation reads what it made through `onCreateResult`. */
  handleCreateTerminal: (
    agent?: MobileSessionContinuationAgent,
    options?: MobileTerminalContinuationCreateOptions
  ) => Promise<unknown>
}) {
  const { handleCreateTerminal } = scope
  const createTerminal = useCallback(
    async (
      agent: MobileSessionContinuationAgent,
      cwd: string | null,
      clientMutationId: string
    ): Promise<MobileContinuationCreateResult> => {
      // Passing options at all keeps this on the terminal channel (the structured route is the
      // bare-agent case), and reuses the existing activate/subscribe/toast behaviour.
      const result = await createMobileTerminalWithResult(handleCreateTerminal, agent, {
        ...(cwd ? { cwd } : {}),
        clientMutationId
      })
      if (result?.kind === 'terminal') {
        return { kind: 'terminal', handle: result.handle }
      }
      // A tab without a handle is a live session this delivery cannot write to; keep it distinct
      // from a create that never happened.
      return result?.kind === 'terminal-without-handle'
        ? { kind: 'without-handle' }
        : { kind: 'failed' }
    },
    [handleCreateTerminal]
  )
  return useMobileSessionContinuation({
    client: scope.client,
    worktreeId: scope.worktreeId,
    deviceToken: scope.deviceTokenRef.current,
    createTerminal,
    showToast: scope.showToast
  })
}
