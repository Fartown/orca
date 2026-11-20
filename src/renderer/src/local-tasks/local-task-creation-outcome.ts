import {
  launchStructuredWorktreeSession,
  type WorktreeCreationStructuredSessionResult
} from '@/lib/workspace/creation/worktree-creation-structured-session'
import {
  trackCreationOutcome,
  type StructuredCreationSessionOutcome
} from './local-task-creation-outcome-tracking'

export type { StructuredCreationSessionOutcome }

export type StructuredSessionResultWithOutcome = WorktreeCreationStructuredSessionResult & {
  sessionOutcome?: Promise<StructuredCreationSessionOutcome>
}

/** The structured create plus the chat or terminal it actually opened, for the task that asked for it. */
export async function launchStructuredWorktreeSessionWithOutcome(
  args: Parameters<typeof launchStructuredWorktreeSession>[0]
): Promise<StructuredSessionResultWithOutcome> {
  const tracking = trackCreationOutcome(args.creationId)
  try {
    const result = await launchStructuredWorktreeSession(args)
    const sessionOutcome = tracking.outcome()
    // A cancelled or retained create opened nothing the task should record.
    return result.cancelled || result.retainedInput || !sessionOutcome
      ? result
      : { ...result, sessionOutcome }
  } finally {
    tracking.stop()
  }
}
