import { useCallback } from 'react'
import type { MobileTerminalCreateResult } from '../session/use-mobile-session-terminal-create-actions'
import type { RpcClient } from '../transport/rpc-client'
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
  handleCreateTerminal: (
    agent?: MobileSessionContinuationAgent,
    options?: { cwd?: string; clientMutationId?: string }
  ) => Promise<MobileTerminalCreateResult>
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
      const result = await handleCreateTerminal(agent, {
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
