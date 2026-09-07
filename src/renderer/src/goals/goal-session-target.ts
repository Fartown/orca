import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import type { GoalBinding } from '../../../shared/goals/goal-control-contract'
import type { RuntimeTerminalResolvePane } from '../../../shared/runtime-terminal-contracts'
import { callRuntimeRpc } from '../runtime/runtime-rpc-client'

export type GoalSessionCandidate = {
  paneKey: string
  tabId: string | null
  agentType: string | null
  title: string | null
  state: AgentStatusEntry['state']
  terminalHandle: string | null
}

/**
 * Trusted existing sessions of a workspace: the hook-backed agent rows the
 * renderer already tracks. A plain shell has no row and is not offered.
 */
export function listGoalSessionCandidates(
  agentStatusByPaneKey: Record<string, AgentStatusEntry | undefined>,
  worktreeId: string
): GoalSessionCandidate[] {
  return Object.values(agentStatusByPaneKey)
    .filter(
      (entry): entry is AgentStatusEntry => Boolean(entry) && entry?.worktreeId === worktreeId
    )
    .filter((entry) => entry.restoredUnconfirmed !== true)
    .map((entry) => ({
      paneKey: entry.paneKey,
      tabId: entry.tabId ?? null,
      agentType: entry.agentType ?? null,
      title: entry.terminalTitle ?? null,
      state: entry.state,
      terminalHandle: entry.terminalHandle ?? null
    }))
    .sort((a, b) => a.paneKey.localeCompare(b.paneKey))
}

export type GoalBindingResolution =
  | { ok: true; binding: GoalBinding }
  | { ok: false; reason: 'pane-missing' | 'incarnation-missing' | 'workspace-mismatch' }

/** The host, not the renderer, names the terminal: resolve the pane and pin its PTY incarnation. */
export async function resolveGoalBindingForPane(
  worktreeId: string,
  paneKey: string
): Promise<GoalBindingResolution> {
  const result = await callRuntimeRpc<{ terminal: RuntimeTerminalResolvePane | null }>(
    { kind: 'local' },
    'terminal.resolvePane',
    { paneKey, worktreeId },
    { timeoutMs: 15_000 }
  )
  const terminal = result?.terminal
  if (!terminal) {
    return { ok: false, reason: 'pane-missing' }
  }
  if (terminal.worktreeId && terminal.worktreeId !== worktreeId) {
    return { ok: false, reason: 'workspace-mismatch' }
  }
  if (!terminal.incarnationId) {
    return { ok: false, reason: 'incarnation-missing' }
  }
  return {
    ok: true,
    binding: {
      worktree: worktreeId,
      terminal: terminal.handle,
      expectedIncarnationId: terminal.incarnationId
    }
  }
}

/** The pane a bound goal writes into, by the runtime handle the host stored. */
export function findPaneForTerminalHandle(
  agentStatusByPaneKey: Record<string, AgentStatusEntry | undefined>,
  terminalHandle: string
): { tabId: string; leafId: string } | null {
  for (const entry of Object.values(agentStatusByPaneKey)) {
    if (!entry || entry.terminalHandle !== terminalHandle) {
      continue
    }
    const [tabId, leafId] = entry.paneKey.split(':')
    if (tabId && leafId) {
      return { tabId: entry.tabId ?? tabId, leafId }
    }
  }
  return null
}
