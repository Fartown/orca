import { isKnownHarnessInjectedUserTurnText } from '../harness-injected-user-turns'

const LOW_INFORMATION_PROMPT =
  /^(?:yes|no|ok|okay|yep|nope|sure|thanks|thank you|please|proceed|continue|go ahead|lgtm|done|looks good|ok proceed|hi|hey|hello|yo|继续|好的|好|可以|行|嗯|谢谢|你好|继续吧|改吧)[.!?。！？,，…]*$/i

export function isLowInformationSessionPrompt(prompt: string): boolean {
  const trimmed = prompt.trim()
  return !trimmed || (trimmed.length <= 32 && LOW_INFORMATION_PROMPT.test(trimmed))
}

export function isEligibleSessionNamePrompt(prompt: string): boolean {
  return !isKnownHarnessInjectedUserTurnText(prompt) && !isLowInformationSessionPrompt(prompt)
}
