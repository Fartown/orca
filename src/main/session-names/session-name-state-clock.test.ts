import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AgentHookServer, _internals } from '../agent-hooks/server'
import { buildBody, postHookEvent } from '../agent-hooks/server.test-fixtures'

vi.mock('../telemetry/client', () => ({ track: vi.fn() }))
vi.mock('../telemetry/cohort-classifier', () => ({ getCohortAtEmit: () => ({}) }))

beforeEach(() => _internals.resetCachesForTests())
afterEach(() => vi.restoreAllMocks())

it('HTTP Stop A → Stop B starts B own clock, and repeated B keeps that clock', async () => {
  const server = new AgentHookServer()
  await server.start({ env: 'production' })
  let now = 1_789_002_853_106
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  const delivered: { sessionId?: string; stateStartedAt: number }[] = []
  server.setListener((event) => {
    delivered.push({ sessionId: event.providerSession?.id, stateStartedAt: event.stateStartedAt })
  })
  const postStop = async (id: string): Promise<void> => {
    const response = await postHookEvent(
      server,
      buildBody({ hook_event_name: 'Stop', session_id: id }),
      '/hook/codex'
    )
    expect(response.status).toBe(204)
  }
  try {
    await postStop('A')
    now = 1_789_002_854_322
    await postStop('B')
    const b = server.getStatusSnapshot()[0]
    expect(b.providerSession?.id).toBe('B')
    expect(b.state).toBe('done')
    expect(b.stateStartedAt).toBe(now)
    now += 100
    await postStop('B')
    expect(server.getStatusSnapshot()[0].stateStartedAt).toBe(b.stateStartedAt)
    expect(delivered).toEqual([
      { sessionId: 'A', stateStartedAt: 1_789_002_853_106 },
      { sessionId: 'B', stateStartedAt: 1_789_002_854_322 },
      { sessionId: 'B', stateStartedAt: 1_789_002_854_322 }
    ])
  } finally {
    server.stop()
  }
})
