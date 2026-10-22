import type { AiVaultSessionTitle } from '../../../shared/ai-vault-session-title'

/** An explicit host rename is manual evidence, not an unverified Provider name. */
export function mirrorHostManualName(
  slot: AiVaultSessionTitle | undefined,
  manual: string | null | undefined
): AiVaultSessionTitle | undefined {
  return slot && manual !== undefined ? { ...slot, manualTitle: manual?.trim() || null } : slot
}
