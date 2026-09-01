import { AI_VAULT_AGENT_LABELS, type AiVaultAgent } from './ai-vault-types'
import type { TuiAgent } from './tui-agent'
import { TUI_AGENT_DISPLAY_NAMES } from './tui-agent-display-names'

/**
 * The canonical fallback name for a provider session, e.g. `Claude a1b2c3d4`.
 *
 * Why: for AI Vault agents this must be byte-for-byte the string the session
 * scanner's `finalizeSession` falls back to, so a closed session's minted name
 * matches what the right-side history shows and searches.
 */
export function mintAgentSessionFallbackTitle(agent: TuiAgent, sessionId: string): string {
  const label =
    agent in AI_VAULT_AGENT_LABELS
      ? AI_VAULT_AGENT_LABELS[agent as AiVaultAgent]
      : TUI_AGENT_DISPLAY_NAMES[agent]
  return `${label} ${sessionId.slice(0, 8)}`
}
