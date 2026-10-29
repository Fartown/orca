import type { LocalTasksCopy } from './local-tasks-copy'
import type { LocalTaskLaunchOutcome } from './local-task-agent-launch'
import { localTaskWriteMessage } from './local-task-failure-message'

/** What the user is told after a launch; null when it went through and the session opened. */
export function localTaskLaunchMessage(
  copy: LocalTasksCopy,
  outcome: LocalTaskLaunchOutcome
): string | null {
  switch (outcome.kind) {
    case 'done':
    case 'workspace-created':
      return null
    case 'failed':
      return outcome.reason === 'update-desktop'
        ? copy.work.updateDesktop
        : (outcome.message ?? copy.failureGeneric('agent.launch'))
    case 'unconfirmed':
      return copy.work.launchUnconfirmed
    case 'workspace-unconfirmed':
      return copy.work.workspaceUnconfirmed
    case 'not-linked': {
      const why = localTaskWriteMessage(copy, outcome.write)
      return why ? `${copy.work.startedNotLinked} ${why}` : copy.work.startedNotLinked
    }
    case 'session-not-recorded':
      return copy.work.sessionNotRecorded
  }
}
