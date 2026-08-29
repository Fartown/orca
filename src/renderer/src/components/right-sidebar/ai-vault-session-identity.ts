import type { AgentProviderSessionMetadata } from '../../../../shared/agent-session-resume'
import type { AiVaultListResult, AiVaultSession } from '../../../../shared/ai-vault-types'
import { normalizeRuntimePathForComparison } from '../../../../shared/cross-platform-path'
import { getAiVaultAgentProviderSession } from '@/lib/ai-vault-resume-command'
import { structuralValuesEqual } from '../../../../shared/structural-value-equality'
import { reuseEqualCatalogRows } from '@/store/slices/worktree-catalog-reconciliation'

// One instance is shared by every mounted hook, so it is frozen: an in-place
// sort or push by any consumer would otherwise leak into every other panel.
export const EMPTY_AI_VAULT_SESSIONS: readonly AiVaultSession[] = Object.freeze([])

// Why: listSessions always structured-clones nested session rows (previewMessages,
// subagent). A TTL miss remints scannedAt even when the disk contents did not
// change, and all-host merge used to remint it even on cache-hit legs. The panel
// only skipped apply when scannedAt matched, so alt-tab after 15s rebuilt
// sessionProjectById + the worktree path map for every row. Reuse previous row
// and result identity when the payload is structurally unchanged so those memos
// stay cold. Reference compare is inert here — IPC clones never match.
export function reuseAiVaultListResult(
  current: AiVaultListResult | null,
  incoming: AiVaultListResult
): AiVaultListResult {
  if (current === incoming) {
    return current
  }
  if (!current) {
    return incoming
  }
  const sessions = reuseEqualCatalogRows(current.sessions, incoming.sessions)
  const issues = structuralValuesEqual(current.issues, incoming.issues)
    ? current.issues
    : incoming.issues
  if (
    sessions === current.sessions &&
    issues === current.issues &&
    current.cancelled === incoming.cancelled
  ) {
    return current
  }
  if (sessions === incoming.sessions && issues === incoming.issues) {
    return incoming
  }
  return { ...incoming, sessions, issues }
}

export function applyPublishedAiVaultList(
  published: AiVaultListResult,
  setScanResult: (updater: (prev: AiVaultListResult | null) => AiVaultListResult) => void
): void {
  setScanResult((prev) => reuseAiVaultListResult(prev, published))
}

export function findAiVaultSessionByProviderIdentity(
  sessions: readonly AiVaultSession[],
  identity: {
    executionHostId: AiVaultSession['executionHostId']
    agent: string
    providerSession: AgentProviderSessionMetadata
  }
): AiVaultSession | null {
  const matches = sessions.filter((session) => {
    const providerSession = getAiVaultAgentProviderSession(session)
    return (
      session.executionHostId === identity.executionHostId &&
      session.agent === identity.agent &&
      providerSession?.key === identity.providerSession.key &&
      providerSession.id === identity.providerSession.id
    )
  })
  if (matches.length === 1) {
    return matches[0] ?? null
  }

  const transcriptPath = identity.providerSession.transcriptPath
  if (matches.length < 2 || !transcriptPath) {
    return null
  }
  const normalizedTranscriptPath = normalizeRuntimePathForComparison(transcriptPath)
  const pathMatches = matches.filter(
    (session) => normalizeRuntimePathForComparison(session.filePath) === normalizedTranscriptPath
  )
  return pathMatches.length === 1 ? (pathMatches[0] ?? null) : null
}
