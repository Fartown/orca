import { beginStructuredAgentSessionProvisionalLaunch as beginProvisionalLaunch } from '@/lib/agent-session/structured-agent-session-provisional-tab'
import { openBackgroundDeclinedTerminal as openDeclinedTerminal } from '@/lib/workspace/creation/worktree-creation-background-mount'
import { settleAgentTabLaunch } from '@/lib/agent-session/launch/new-tab/launch-agent-in-new-tab-host-agents'
import type { LaunchAgentInNewTabArgs } from '@/lib/agent-session/launch/new-tab/launch-agent-in-new-tab-args'
import type { launchAgentInNewTabWithOutcome as LaunchNewTab } from '@/lib/agent-session/launch/new-tab/launch-agent-in-new-tab'

export type StructuredCreationSessionOutcome =
  | { kind: 'chat'; sessionId: string }
  | { kind: 'terminal'; tabId: string | null }
  | { kind: 'none' }

type CreationOutcomeTracker = {
  declinedTerminalTabId: string | null
  outcome?: Promise<StructuredCreationSessionOutcome>
}

const NONE: StructuredCreationSessionOutcome = { kind: 'none' }
const trackers = new Map<string, CreationOutcomeTracker>()

/** Watches one structured create (keyed by its creation id) so a task records the session it really opened. */
export function trackCreationOutcome(creationId: string): {
  outcome: () => Promise<StructuredCreationSessionOutcome> | undefined
  stop: () => void
} {
  const tracker: CreationOutcomeTracker = { declinedTerminalTabId: null }
  trackers.set(creationId, tracker)
  return {
    outcome: () => tracker.outcome,
    stop: () => {
      if (trackers.get(creationId) === tracker) {
        trackers.delete(creationId)
      }
    }
  }
}

/** The chat launch; its settlement is the create's outcome unless a recovery terminal replaces it. */
export function beginStructuredAgentSessionProvisionalLaunch(
  args: Parameters<typeof beginProvisionalLaunch>[0]
): ReturnType<typeof beginProvisionalLaunch> {
  const launch = beginProvisionalLaunch(args)
  const tracker = trackers.get(args.plan.requestId)
  if (tracker) {
    tracker.outcome = launch?.settlement.then(
      (settlement): StructuredCreationSessionOutcome => {
        if (settlement.kind === 'structured') {
          return { kind: 'chat', sessionId: settlement.sessionId }
        }
        if (settlement.kind === 'terminal') {
          return { kind: 'terminal', tabId: tracker.declinedTerminalTabId }
        }
        return NONE
      },
      (): StructuredCreationSessionOutcome => NONE
    )
  }
  return launch
}

/** A host that declines the chat runs the agent in this terminal instead. */
export function openBackgroundDeclinedTerminal(
  args: Parameters<typeof openDeclinedTerminal>[0] & { creationId: string },
  ...rest: Parameters<typeof openDeclinedTerminal> extends [unknown, ...infer R] ? R : never
): ReturnType<typeof openDeclinedTerminal> {
  const terminal = openDeclinedTerminal(args, ...rest)
  const tracker = trackers.get(args.creationId)
  if (tracker) {
    tracker.declinedTerminalTabId = terminal.tabId ?? null
  }
  return terminal
}

/** Lazily loads the new-tab launcher; a created recovery terminal becomes the create's outcome. */
export async function loadNewTabLaunch(): Promise<{
  launchAgentInNewTabWithOutcome: typeof LaunchNewTab
}> {
  const { launchAgentInNewTabWithOutcome: launch } =
    await import('@/lib/agent-session/launch/new-tab/launch-agent-in-new-tab')
  return {
    launchAgentInNewTabWithOutcome: (args: LaunchAgentInNewTabArgs, notifyFailure?: boolean) => {
      const fallback = launch(args, notifyFailure)
      const tracker = trackers.get(args.agentSessionLaunchPlan?.requestId ?? args.requestId ?? '')
      if (tracker) {
        const previous = tracker.outcome ?? Promise.resolve(NONE)
        tracker.outcome = settleAgentTabLaunch(fallback).then(
          (settled) =>
            settled.kind === 'terminal' && fallback && !('refused' in fallback)
              ? {
                  kind: 'terminal' as const,
                  tabId: fallback.surface.kind === 'local-terminal' ? fallback.surface.tabId : null
                }
              : previous,
          () => previous
        )
      }
      return fallback
    }
  }
}
