import { isKnownHarnessInjectedUserTurnText } from '../agent-session/journal/harness-injected-user-turns'
import { isCodexRecapTaskText } from './codex-recap-task-text'

const HEAD_SCAN_LIMIT = 256

const LOW_INFORMATION_PROMPT =
  /^(?:yes|no|ok|okay|yep|nope|sure|thanks|thank you|please|proceed|continue|go ahead|lgtm|done|looks good|ok proceed|hi|hey|hello|yo|\u7ee7\u7eed|\u597d\u7684|\u597d|\u53ef\u4ee5|\u884c|\u55ef|\u8c22\u8c22|\u4f60\u597d|\u7ee7\u7eed\u5427|\u6539\u5427)[.!?\u3002\uff01\uff1f,\uff0c\u2026]*$/i

const ORCHESTRATION_MAIL_ENVELOPE =
  /^(?:\u2500{4,}\s*from:\s|---\s+orchestration messages\s+\(\d+\)\s+---)/i
const DERIVED_ORCHESTRATION_MAIL_TITLE =
  /^(?:from\s+(?:term|run|dispatch|orca)[_\s][0-9a-z]|orchestration messages\s+\d+$)/i
const ORCA_INJECTED_BOILERPLATE_TITLE =
  /^(?:continue work from the prior orca(?:\s+session\b|$)|(?:please\s+)?carry out this task from my orca\b|you are working inside orca\b)/i

export function isOrcaInjectedSessionPrompt(prompt: string): boolean {
  const head = prompt.slice(0, HEAD_SCAN_LIMIT).trim()
  return (
    Boolean(head) &&
    (ORCHESTRATION_MAIL_ENVELOPE.test(head) ||
      DERIVED_ORCHESTRATION_MAIL_TITLE.test(head) ||
      ORCA_INJECTED_BOILERPLATE_TITLE.test(head))
  )
}

export function isLowInformationSessionPrompt(prompt: string): boolean {
  const trimmed = prompt.trim()
  return !trimmed || (trimmed.length <= 32 && LOW_INFORMATION_PROMPT.test(trimmed))
}

export function isEligibleSessionNamePrompt(prompt: string): boolean {
  return (
    !isKnownHarnessInjectedUserTurnText(prompt) &&
    !isCodexRecapTaskText(prompt) &&
    !isOrcaInjectedSessionPrompt(prompt) &&
    !isLowInformationSessionPrompt(prompt)
  )
}
