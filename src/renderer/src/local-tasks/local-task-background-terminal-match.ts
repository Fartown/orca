import type { RuntimeTerminalSummary } from '../../../shared/runtime-terminal-contracts'
import { parsePaneKey } from '../../../shared/stable-pane-id'

/**
 * The terminal recorded for a pane that has never mounted: a session launched in the background
 * is listed as orphaned until its workspace is opened, with the pane it belongs to kept apart.
 * Null unless exactly one such terminal names that pane, so a stale orphan is never guessed at.
 */
export function findTerminalAtRecordedPane<T extends RuntimeTerminalSummary>(
  terminals: readonly T[],
  pane: { tabId: string; leafId: string }
): T | null {
  const recorded = terminals.filter((terminal) => {
    const key = terminal.orphaned ? parsePaneKey(terminal.recordedPaneKey ?? '') : null
    return key !== null && key.tabId === pane.tabId && key.leafId === pane.leafId
  })
  return recorded.length === 1 ? recorded[0]! : null
}
