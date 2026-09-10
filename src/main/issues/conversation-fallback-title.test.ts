import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createAccumulator, finalizeSession } from '../ai-vault/session-scanner-accumulator'
import { mintAgentSessionFallbackTitle } from '../../shared/agent-session-fallback-title'
import { AI_VAULT_AGENTS } from '../../shared/ai-vault-types'

describe('conversation fallback title compatibility', () => {
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
