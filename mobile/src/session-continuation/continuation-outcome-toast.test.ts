import { describe, expect, it, vi } from 'vitest'
import { CONTINUATION_COPY } from './continuation-copy'
import { continuationOutcomeToast } from './use-mobile-session-continuation'

vi.mock('../platform/haptics', () => ({ triggerError: vi.fn(), triggerSuccess: vi.fn() }))
vi.mock('../session/mobile-new-tab-agent-loader', () => ({ loadMobileNewTabAgentOptions: vi.fn() }))

describe('continuation delivery failure feedback', () => {
  it.each(['claude', 'codex'] as const)(
    'keeps both delivery failures identical for %s',
    (agent) => {
      const expected = { message: CONTINUATION_COPY.deliveryFailed(agent), ok: false }
      expect(
        continuationOutcomeToast({ kind: 'not-ready', handle: 'term', status: 'timeout' }, agent)
      ).toEqual(expected)
      expect(continuationOutcomeToast({ kind: 'send-rejected', handle: 'term' }, agent)).toEqual(
        expected
      )
      expect(continuationOutcomeToast({ kind: 'created-without-handle' }, agent)).toEqual(expected)
    }
  )
})
