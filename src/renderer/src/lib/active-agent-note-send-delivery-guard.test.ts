import { beforeEach, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({
  rpc: vi.fn(),
  readiness: vi.fn()
}))

vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: fixture.rpc }))
vi.mock('./active-agent-terminal-send-readiness', () => ({
  ACTIVE_AGENT_SEND_RPC_TIMEOUT_MS: 15000,
  getTerminalAgentSendReadiness: fixture.readiness,
  isRuntimeTerminalNotWritable: () => false,
  isRuntimeTerminalUnavailable: () => false
}))

import { sendPromptWithGuardedPasteAndEnter } from './active-agent-note-send-delivery'

beforeEach(() => {
  fixture.rpc.mockReset().mockResolvedValue({ send: { accepted: true } })
  fixture.readiness.mockReset().mockResolvedValue({ status: 'sendable', supportsGuardedSend: true })
})

it('does not paste when terminal input changed after the earlier wake check', async () => {
  const result = await sendPromptWithGuardedPasteAndEnter({ kind: 'local' }, 'terminal-1', 'wake', {
    allowLegacyFallback: false,
    beforeTerminalSend: () => false
  })
  expect(result).toMatchObject({ status: 'not-ready' })
  expect(fixture.rpc).not.toHaveBeenCalled()
})

it('does not submit when the person inputs during the paste interval', async () => {
  const phases: string[] = []
  const result = await sendPromptWithGuardedPasteAndEnter({ kind: 'local' }, 'terminal-1', 'wake', {
    allowLegacyFallback: false,
    beforeTerminalSend: (phase) => {
      phases.push(phase)
      return phase !== 'submit'
    }
  })
  expect(result).toMatchObject({ status: 'partial-submit-failed' })
  expect(phases).toEqual(['paste', 'submit'])
  expect(fixture.rpc).toHaveBeenCalledTimes(1)
  expect(fixture.rpc.mock.calls[0][2]).toHaveProperty('text')
})
