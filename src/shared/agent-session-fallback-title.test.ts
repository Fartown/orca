import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { mintAgentSessionFallbackTitle } from './agent-session-fallback-title'
import { AI_VAULT_AGENTS, AI_VAULT_AGENT_LABELS } from './ai-vault-types'
import type { TuiAgent } from './tui-agent'
import { TUI_AGENT_DISPLAY_NAMES } from './tui-agent-display-names'

describe('agent session fallback title', () => {
  it('mints the scanner fallback string byte-for-byte for every AI Vault agent', () => {
    for (const agent of AI_VAULT_AGENTS) {
      expect(mintAgentSessionFallbackTitle(agent, 'a1b2c3d4-rest-of-uuid')).toBe(
        `${AI_VAULT_AGENT_LABELS[agent]} a1b2c3d4`
      )
    }
  })

  it('produces a non-empty name for every TuiAgent', () => {
    for (const agent of Object.keys(TUI_AGENT_DISPLAY_NAMES) as TuiAgent[]) {
      const title = mintAgentSessionFallbackTitle(agent, 'ffffffff')
      expect(title.trim().length, agent).toBeGreaterThan('ffffffff'.length)
    }
  })

  it('degrades gracefully on short session ids', () => {
    expect(mintAgentSessionFallbackTitle('claude', 'ab')).toBe('Claude ab')
  })

  // The scanner keeps its own inline copy of the formula (kept inline so the
  // main-side minting path stays importable without the scanner). This pins
  // the two copies to the same shape so they cannot drift apart silently.
  it('matches the finalizeSession fallback expression in the session scanner', () => {
    const scannerSource = readFileSync(
      join(process.cwd(), 'src/main/ai-vault/session-scanner-accumulator.ts'),
      'utf8'
    )
    expect(scannerSource).toContain(
      '`${aiVaultAgentLabel(accumulator.agent)} ${sessionId.slice(0, 8)}`'
    )
  })
})
