import type {
  OrchestrationCompatibilityTerminalAuthority,
  RestoredOrchestrationAuthorityReceipt
} from '../runtime/orchestration/terminal-authority/orchestration-compatibility-authority'

export function restoredTerminalAuthorityMatches(
  receipt: RestoredOrchestrationAuthorityReceipt | undefined,
  terminal: OrchestrationCompatibilityTerminalAuthority,
  hostScopesEqual: (
    left: OrchestrationCompatibilityTerminalAuthority['hostScope'],
    right: OrchestrationCompatibilityTerminalAuthority['hostScope']
  ) => boolean
): boolean {
  return !!(
    receipt &&
    receipt.ptyId === terminal.ptyId &&
    receipt.worktreeId === terminal.worktreeId &&
    receipt.terminalHandle === terminal.terminalHandle &&
    receipt.paneKey === terminal.paneKey &&
    receipt.processIncarnation === terminal.processIncarnation &&
    hostScopesEqual(receipt.hostScope, terminal.hostScope)
  )
}
