import type { AiVaultSessionTitle } from '../ai-vault/contracts/ai-vault-session-title'
import { parseExecutionHostId, type ExecutionHostId } from '../execution-host/execution-host'

/** Mirrored runtime snapshots stamp `environmentId` while remote PTY routing uses `null` for the same host. */
export function normalizeExecutionHostConnectionId(
  executionHostId: ExecutionHostId | null | undefined,
  connectionId: string | null | undefined
): string | null {
  const host = parseExecutionHostId(executionHostId)
  if (host?.kind === 'runtime' && connectionId === host.environmentId) {
    return null
  }
  return connectionId ?? null
}

export function sessionNameSlotSupersededByStatus(
  slot: AiVaultSessionTitle | null | undefined,
  status:
    | {
        agentType?: string | null
        providerSession?: { id?: string } | null
        sessionBoundary?: boolean
      }
    | null
    | undefined
): boolean {
  if (!slot || !status) {
    return false
  }
  if (status.sessionBoundary) {
    return true
  }
  if (status.agentType && status.agentType !== 'unknown' && status.agentType !== slot.agent) {
    return true
  }
  const nextId = status.providerSession?.id
  return Boolean(nextId && nextId !== slot.sessionId)
}
