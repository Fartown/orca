import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createAccumulator, finalizeSession } from '../main/ai-vault/session-scanner-accumulator'
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

  it('matches finalized scanner titles for every provider and host platform', () => {
    for (const agent of AI_VAULT_AGENTS) {
      for (const platform of ['darwin', 'linux', 'win32'] as const) {
        for (const sessionId of ['a1b2c3d4-rest-of-uuid', 'ab']) {
          const accumulator = createAccumulator({
            agent,
            sessionId,
            file: {
              path: join(process.cwd(), 'fixture.jsonl'),
              modifiedAt: '2026-09-10T00:00:00Z',
              mtimeMs: Date.parse('2026-09-10T00:00:00Z')
            }
          })
          expect(finalizeSession(accumulator, platform)?.title).toBe(
            mintAgentSessionFallbackTitle(agent, sessionId)
          )
        }
      }
    }
  })
})
