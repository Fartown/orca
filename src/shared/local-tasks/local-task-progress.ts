/** Longest "what it needs from you" line an agent can attach to a progress writeback. */
export const LOCAL_TASK_NEEDS_YOU_MAX = 500

/**
 * A writeback is an ordinary comment whose payload carries this mark, so hosts and clients from
 * before writebacks still show it as a comment (REQ-022).
 */
export type LocalTaskProgressMark = {
  progress: true
  sessionLinkId?: string
  needsYou?: string
}

export function localTaskProgressPayload(input: {
  sessionLinkId?: string
  needsYou?: string
}): LocalTaskProgressMark {
  return {
    progress: true,
    ...(input.sessionLinkId ? { sessionLinkId: input.sessionLinkId } : {}),
    ...(input.needsYou ? { needsYou: input.needsYou } : {})
  }
}

export function isLocalTaskProgressPayload(payload: Record<string, unknown> | null): boolean {
  return payload?.progress === true
}
