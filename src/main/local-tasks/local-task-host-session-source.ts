import type { LocalTaskStatusRow } from '../../shared/local-tasks/local-task-attention-rules'

/**
 * What the library's own Orca knows about its agent sessions (D-008): its agent status store, its
 * terminals and its SSH connections. Read in memory only; nothing here reaches another host.
 */
export type LocalTaskHostSessionSource = {
  /** Status rows the host holds for one pane, provider-session-only rows left out. */
  rowsForPane(paneKey: string): readonly LocalTaskStatusRow[]
  /** Every pane key with a status row, for claiming a session recorded by tab alone. */
  paneKeys(): readonly string[]
  /** Whether a running process holds the pane's terminal now. */
  terminalLive(paneKey: string): boolean
  /** `local` always; an SSH target while it is connected; any other host is never this Orca's. */
  inContact(hostId: string): boolean
  /** Status, pane and contact changes, pushed by the host; nothing polls. */
  subscribe(onChange: () => void): () => void
}

/** A host that reports no agent status: every session reads `unknown`. */
export const SILENT_LOCAL_TASK_HOST_SESSIONS: LocalTaskHostSessionSource = {
  rowsForPane: () => [],
  paneKeys: () => [],
  terminalLive: () => false,
  inContact: (hostId) => hostId === 'local',
  subscribe: () => () => {}
}
