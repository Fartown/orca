import { afterEach, expect, it } from 'vitest'
import { getSessionNameDisplayIndex } from './session-name-display'
import { sessionNameStore } from './session-name-store'
import { canonicalSessionTitleKey } from '../lib/canonical-session-titles'
import { mintAgentSessionFallbackTitle } from '../../../shared/agent-session-fallback-title'

const key = canonicalSessionTitleKey('local', 'codex', 's1')
afterEach(() => sessionNameStore.reset())

it('does not promote an identity fallback above a consumer-owned live title or label', () => {
  sessionNameStore.publish('local', {
    titles: [],
    nameEvidence: [{ agent: 'codex', sessionId: 's1', providerName: { kind: 'unavailable' } }]
  })
  expect(getSessionNameDisplayIndex().has(key)).toBe(false)
})

it('keeps an explicitly native name even if its text happens to equal an identity fallback', () => {
  const title = mintAgentSessionFallbackTitle('codex', 's1')
  sessionNameStore.publish('local', {
    titles: [],
    nameEvidence: [
      {
        agent: 'codex',
        sessionId: 's1',
        providerName: { kind: 'named', title, field: 'session_index.thread_name' }
      }
    ]
  })
  expect(getSessionNameDisplayIndex().get(key)).toBe(title)
})
