import { parsePaneKey } from '../workspace-layout/stable-pane-id'
import type { TerminalLayoutSnapshot } from '../workspace-layout/terminal-tab-types'

/** A background split can name its own session, but cannot set the tab-wide task. */
export function paneOwnsTabPrompt(
  layout: TerminalLayoutSnapshot | undefined,
  paneKey: string
): boolean {
  return (
    layout?.root?.type !== 'split' ||
    Boolean(layout.activeLeafId && parsePaneKey(paneKey)?.leafId === layout.activeLeafId)
  )
}
