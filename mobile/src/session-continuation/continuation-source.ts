import type { AgentSessionContinuationSource } from '../../../src/shared/agent-session-continuation/continuation-prompt'
import type { AgentStatusEntry } from '../../../src/shared/agent-status-types'
import type { TuiAgent } from '../../../src/shared/tui-agent'
import {
  isMobileSessionContinuationAgent,
  type MobileSessionContinuationAgent
} from './continuation-agents'

export type MobileContinuationTab = {
  type: string
  title?: string
  launchAgent?: TuiAgent
  agentStatus?: AgentStatusEntry | null
  startupCwd?: string
}

export type MobileContinuationEligibility =
  | {
      eligible: true
      sourceAgent: MobileSessionContinuationAgent
      source: AgentSessionContinuationSource
    }
  | { eligible: false; reason: 'unsupported-agent' | 'no-transcript' | 'host-capability' }

/** Agent comes from the live status when it reported one, otherwise from the launch hint —
 *  the same order `resolveMobileNativeChat` uses. A live agent outside the allowed set is a
 *  refusal, not a reason to fall back to the hint: that process is what would receive the prompt. */
function resolveSourceAgent(tab: MobileContinuationTab): MobileSessionContinuationAgent | null {
  const liveAgent = tab.agentStatus?.agentType ?? null
  const agent = liveAgent
    ? isMobileSessionContinuationAgent(liveAgent)
      ? liveAgent
      : null
    : tab.launchAgent
  return isMobileSessionContinuationAgent(agent) ? agent : null
}

/**
 * Resolve a terminal tab into the source a continuation prompt is built from, or the reason
 * the entry must stay hidden. Mobile has no terminal scrollback to serialize, so a session
 * without a hook-reported transcript path has no context to hand over at all.
 */
export function resolveMobileContinuationSource(
  tab: MobileContinuationTab | null,
  hostSupported: boolean | null
): MobileContinuationEligibility {
  if (hostSupported !== true) {
    return { eligible: false, reason: 'host-capability' }
  }
  const sourceAgent = tab && tab.type === 'terminal' ? resolveSourceAgent(tab) : null
  if (!tab || !sourceAgent) {
    return { eligible: false, reason: 'unsupported-agent' }
  }
  const transcriptPath = tab.agentStatus?.providerSession?.transcriptPath?.trim() || null
  if (!transcriptPath) {
    return { eligible: false, reason: 'no-transcript' }
  }
  const title = tab.title?.trim()
  const workingDirectory = tab.startupCwd?.trim()
  return {
    eligible: true,
    sourceAgent,
    source: {
      sourceAgent,
      // Mobile renders the terminal in a webview with no serializer, so the inline-capture
      // fallback the desktop uses is unavailable; the transcript path above carries the context.
      capturedText: '',
      ...(title ? { sourceTitle: title } : {}),
      ...(workingDirectory ? { sourceWorkingDirectory: workingDirectory } : {}),
      transcriptPath,
      lastPrompt: tab.agentStatus?.prompt ?? null,
      lastAssistantMessage: tab.agentStatus?.lastAssistantMessage ?? null
    }
  }
}
