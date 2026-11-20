import type { RuntimeClientTarget } from '../../../shared/remote-runtime/host-catalog/runtime-client-target'
import type { AgentStatusEntry } from '../../../shared/agent-status/contracts/agent-status-types'
import type { GoalBinding } from '../../../shared/goals/goal-control-contract'
import type { RuntimeTerminalResolvePane } from '../../../shared/terminal/runtime/runtime-terminal-contracts'
import { callRuntimeRpc } from '../runtime/rpc/calls/runtime-rpc-call'

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
/** The store's accepted agent rows by pane key. */
type GoalAgentStatusRows = Pick<ReadonlyMap<string, AgentStatusEntry | undefined>, 'values'>

export function listGoalSessionCandidates(
  agentStatusByPaneKey: GoalAgentStatusRows,
  worktreeId: string
): GoalSessionCandidate[] {
  return Array.from(agentStatusByPaneKey.values())
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

function sameCandidate(a: GoalSessionCandidate, b: GoalSessionCandidate | undefined): boolean {
  return (
    b !== undefined &&
    a.paneKey === b.paneKey &&
    a.tabId === b.tabId &&
    a.agentType === b.agentType &&
    a.title === b.title &&
    a.state === b.state &&
    a.terminalHandle === b.terminalHandle
  )
}

/** A per-consumer selector whose result keeps its identity while the workspace's candidates stay equal. */
export function createGoalSessionCandidatesSelector(): (
  agentStatusByPaneKey: GoalAgentStatusRows,
  worktreeId: string | null
) => GoalSessionCandidate[] {
  let previous: GoalSessionCandidate[] = []
  return (agentStatusByPaneKey, worktreeId) => {
    const next = worktreeId ? listGoalSessionCandidates(agentStatusByPaneKey, worktreeId) : []
    if (
      next.length === previous.length &&
      next.every((candidate, index) => sameCandidate(candidate, previous[index]))
    ) {
      return previous
    }
    previous = next
    return next
  }
}

export type GoalBindingResolution =
  | { ok: true; binding: GoalBinding }
  | { ok: false; reason: 'pane-missing' | 'incarnation-missing' | 'workspace-mismatch' }

/** The host, not the renderer, names the terminal: resolve the pane and pin its PTY incarnation. */
export async function resolveGoalBindingForPane(
  worktreeId: string,
  paneKey: string,
  target: RuntimeClientTarget = { kind: 'local' }
): Promise<GoalBindingResolution> {
  const result = await callRuntimeRpc<{ terminal: RuntimeTerminalResolvePane | null }>(
    target,
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
  agentStatusByPaneKey: GoalAgentStatusRows,
  terminalHandle: string
): { tabId: string; leafId: string } | null {
  for (const entry of agentStatusByPaneKey.values()) {
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
