import type { ConnectPanePtySession } from '@/components/terminal-pane/pty-connection/connect-pane-pty-session'
import { armPaneOwnerRetry } from '@/components/terminal-pane/pty-connection/host-ownership/pane-owner-recovery'
import { NOT_REOPENED } from '@/components/terminal-pane/pty-connection/startup/cold-restore-resume-startup'
import type { HeldPaneReopenOutcome } from '@/components/terminal-pane/session-restore/newer-daemon/newer-daemon-hold-state'

/** Attach failed without proving the terminal exited: keep its recorded binding and retry later. */
export function retainRecordedTerminalBinding(
  session: ConnectPanePtySession,
  generation: number,
  retry: () => unknown
): HeldPaneReopenOutcome {
  armPaneOwnerRetry(session, generation, retry)
  session.settlePaneAttachAttempt('failed')
  return NOT_REOPENED
}
