import { isKnownHarnessInjectedUserTurnText } from '../harness-injected-user-turns'
import { isCodexRecapTaskText } from './codex-recap-task-text'

const LOW_INFORMATION_PROMPT =
  /^(?:yes|no|ok|okay|yep|nope|sure|thanks|thank you|please|proceed|continue|go ahead|lgtm|done|looks good|ok proceed|hi|hey|hello|yo|\u7ee7\u7eed|\u597d\u7684|\u597d|\u53ef\u4ee5|\u884c|\u55ef|\u8c22\u8c22|\u4f60\u597d|\u7ee7\u7eed\u5427|\u6539\u5427)[.!?\u3002\uff01\uff1f,\uff0c\u2026]*$/i

export function isLowInformationSessionPrompt(prompt: string): boolean {
  const trimmed = prompt.trim()
  return !trimmed || (trimmed.length <= 32 && LOW_INFORMATION_PROMPT.test(trimmed))
}

export function isEligibleSessionNamePrompt(prompt: string): boolean {
  return (
    !isKnownHarnessInjectedUserTurnText(prompt) &&
    !isCodexRecapTaskText(prompt) &&
    !isLowInformationSessionPrompt(prompt)
  )
}
