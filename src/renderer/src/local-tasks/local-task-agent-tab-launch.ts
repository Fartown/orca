import { launchAgentInNewTabWithOutcome } from '@/lib/agent-session/launch/new-tab/launch-agent-in-new-tab'
import type { LaunchAgentInNewTabArgs } from '@/lib/agent-session/launch/new-tab/launch-agent-in-new-tab-args'
import type { LaunchAgentInNewTabResult } from '@/lib/agent-session/launch/new-tab/launch-agent-in-new-tab-host-agents'

/** Task launches report their own failure, so a refused launch reads as one that did not open. */
export function launchLocalTaskAgentTab(args: LaunchAgentInNewTabArgs): LaunchAgentInNewTabResult {
  const outcome = launchAgentInNewTabWithOutcome(args, false)
  return outcome && 'refused' in outcome ? null : outcome
}
