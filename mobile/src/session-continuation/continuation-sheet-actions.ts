import type { ActionSheetAction } from '../components/ActionSheetModal'
import type { AgentSessionContinuationContextMode } from '../../../src/shared/agent-session-continuation/continuation-prompt'
import { CONTINUATION_COPY } from './continuation-copy'
import type { MobileSessionContinuationAgent } from './continuation-agents'

export type MobileContinuationAgentsState =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; agents: readonly MobileSessionContinuationAgent[] }

/**
 * Rows for the continuation picker: one context-mode toggle, then one row per agent that
 * starts the continuation on press. Mirrors the desktop dialog's two choices without adding
 * a UI primitive — the mode row stays open on press, the agent rows commit and close the sheet
 * so the newly activated terminal is visible while the handoff is delivered.
 */
export function buildMobileContinuationSheetActions(args: {
  agents: MobileContinuationAgentsState
  contextMode: AgentSessionContinuationContextMode
  onToggleMode: () => void
  onStart: (agent: MobileSessionContinuationAgent) => void
}): ActionSheetAction[] {
  const isFull = args.contextMode === 'full'
  const modeRow: ActionSheetAction = {
    // Why the label names the *other* mode: this row is a switch, and labelling it with the
    // current mode reads as "pick this one" — one tap would silently opt into a full transcript.
    label: isFull ? CONTINUATION_COPY.switchToFocused : CONTINUATION_COPY.switchToFull,
    hint: isFull ? CONTINUATION_COPY.modeFullHint : CONTINUATION_COPY.modeFocusedHint,
    // Why: switching context is a setting, not a commit; keep the sheet open.
    skipAutoClose: true,
    onPress: args.onToggleMode
  }
  if (args.agents.status === 'loading') {
    return [
      modeRow,
      { label: CONTINUATION_COPY.detecting, loading: true, disabled: true, onPress: () => {} }
    ]
  }
  if (args.agents.status === 'failed') {
    return [modeRow, { label: CONTINUATION_COPY.detectFailed, disabled: true, onPress: () => {} }]
  }
  if (args.agents.agents.length === 0) {
    return [modeRow, { label: CONTINUATION_COPY.noAgents, disabled: true, onPress: () => {} }]
  }
  return [
    modeRow,
    ...args.agents.agents.map((agent) => ({
      label: CONTINUATION_COPY.continueWith(agent),
      hint: CONTINUATION_COPY.continueWithHint,
      onPress: () => args.onStart(agent)
    }))
  ]
}
