import { describe, expect, it, vi } from 'vitest'
import {
  CONTINUATION_SUBMIT_OBSERVE_MS,
  runMobileSessionContinuation
} from './continuation-delivery'
import { markRpcDeliveryUnknown } from '../transport/rpc-delivery-ambiguity'
import type { RpcResponse } from '../transport/types'

const PROMPT = 'Continue work from the prior Orca session using the context below.\nline two'

function ok(result: unknown): RpcResponse {
  return { id: 'r', ok: true, result, _meta: { runtimeId: 'rt' } }
}
function fail(message = 'refused'): RpcResponse {
  return { id: 'r', ok: false, error: { code: 'bad', message }, _meta: { runtimeId: 'rt' } }
}
const READY = ok({
  wait: { handle: 'term_1', condition: 'tui-idle', satisfied: true, status: 'running' }
})
const SENT = ok({
  send: {
    handle: 'term_1',
    accepted: true,
    bytesWritten: 12,
    prompt: { stages: ['input_accepted', 'turn_started'] }
  }
})

function harness(
  responses: Partial<Record<'terminal.wait' | 'terminal.send', RpcResponse | Error>>,
  overrides: {
    createTerminal?: ReturnType<typeof vi.fn>
    prompt?: string
    cwd?: string | null
  } = {}
) {
  const sendRequest = vi.fn(async (method: string) => {
    const reply = responses[method as 'terminal.wait' | 'terminal.send']
    if (reply instanceof Error) {
      throw reply
    }
    return reply ?? fail(`unexpected ${method}`)
  })
  const createTerminal = overrides.createTerminal ?? vi.fn(async () => ({ handle: 'term_1' }))
  return {
    sendRequest,
    createTerminal,
    run: () =>
      runMobileSessionContinuation({
        sendRequest: sendRequest as never,
        createTerminal: createTerminal as never,
        agent: 'claude',
        prompt: overrides.prompt ?? PROMPT,
        cwd: 'cwd' in overrides ? (overrides.cwd ?? null) : '/srv/app',
        deviceToken: 'device-1'
      })
  }
}

describe('mobile session continuation delivery', () => {
  it('creates, waits for readiness, then submits the handoff as one message', async () => {
    const h = harness({ 'terminal.wait': READY, 'terminal.send': SENT })

    await expect(h.run()).resolves.toEqual({
      kind: 'delivered',
      handle: 'term_1',
      stages: ['input_accepted', 'turn_started']
    })
    expect(h.createTerminal).toHaveBeenCalledWith('claude', '/srv/app')
    const [waitMethod, waitParams] = h.sendRequest.mock.calls[0]
    expect(waitMethod).toBe('terminal.wait')
    expect(waitParams).toMatchObject({ terminal: 'term_1', for: 'tui-idle' })
    const [sendMethod, sendParams] = h.sendRequest.mock.calls[1]
    expect(sendMethod).toBe('terminal.send')
    expect(sendParams).toMatchObject({
      terminal: 'term_1',
      enter: true,
      waitSubmitMs: CONTINUATION_SUBMIT_OBSERVE_MS,
      client: { id: 'device-1', type: 'mobile' }
    })
  })

  it('wraps the prompt in bracketed paste so newlines cannot split it into commands', async () => {
    const h = harness({ 'terminal.wait': READY, 'terminal.send': SENT })
    await h.run()

    const text = (h.sendRequest.mock.calls[1][1] as { text: string }).text
    expect(text.startsWith('\x1b[200~')).toBe(true)
    expect(text.endsWith('\x1b[201~')).toBe(true)
    expect(text).toContain('line two')
  })

  it('never touches the host when there is no context to hand over', async () => {
    const h = harness({}, { prompt: '   ' })

    await expect(h.run()).resolves.toEqual({ kind: 'no-context' })
    expect(h.createTerminal).not.toHaveBeenCalled()
    expect(h.sendRequest).not.toHaveBeenCalled()
  })

  it('stops before waiting when the terminal was never created', async () => {
    const h = harness({}, { createTerminal: vi.fn(async () => null) })

    await expect(h.run()).resolves.toEqual({ kind: 'create-failed' })
    expect(h.sendRequest).not.toHaveBeenCalled()
  })

  it('reports not-ready without sending when readiness is unmet', async () => {
    const h = harness({
      'terminal.wait': ok({ wait: { satisfied: false, status: 'running' } }),
      'terminal.send': SENT
    })

    await expect(h.run()).resolves.toEqual({
      kind: 'not-ready',
      handle: 'term_1',
      status: 'running'
    })
    expect(h.sendRequest).toHaveBeenCalledTimes(1)
  })

  it('surfaces a blocked prompt as not-ready even when the host reports satisfied', async () => {
    const h = harness({
      'terminal.wait': ok({ wait: { satisfied: true, status: 'running', blockedReason: 'trust' } })
    })

    await expect(h.run()).resolves.toEqual({
      kind: 'not-ready',
      handle: 'term_1',
      status: 'running',
      blockedReason: 'trust'
    })
  })

  it('treats a refused or unreachable wait as not-ready, keeping the created session', async () => {
    await expect(harness({ 'terminal.wait': fail() }).run()).resolves.toEqual({
      kind: 'not-ready',
      handle: 'term_1',
      status: 'refused'
    })
    await expect(harness({ 'terminal.wait': new Error('offline') }).run()).resolves.toEqual({
      kind: 'not-ready',
      handle: 'term_1',
      status: 'unreachable'
    })
  })

  it('reports a rejected send when input is locked by another client', async () => {
    const h = harness({
      'terminal.wait': READY,
      'terminal.send': ok({ send: { handle: 'term_1', accepted: false, bytesWritten: 0 } })
    })

    await expect(h.run()).resolves.toEqual({ kind: 'send-rejected', handle: 'term_1' })
  })

  it('keeps an ambiguous transport failure unknown instead of resending', async () => {
    const h = harness({
      'terminal.wait': READY,
      'terminal.send': markRpcDeliveryUnknown(new Error('ack lost'))
    })

    await expect(h.run()).resolves.toEqual({ kind: 'unknown', handle: 'term_1' })
    expect(h.sendRequest).toHaveBeenCalledTimes(2)
  })

  it('reports a definite send failure as rejected', async () => {
    const h = harness({ 'terminal.wait': READY, 'terminal.send': new Error('not writable') })

    await expect(h.run()).resolves.toEqual({ kind: 'send-rejected', handle: 'term_1' })
  })

  it('omits cwd when the source session has none', async () => {
    const h = harness({ 'terminal.wait': READY, 'terminal.send': SENT }, { cwd: null })
    await h.run()

    expect(h.createTerminal).toHaveBeenCalledWith('claude', null)
  })

  it('tolerates a host reply without submission stages', async () => {
    const h = harness({
      'terminal.wait': READY,
      'terminal.send': ok({ send: { handle: 'term_1', accepted: true, bytesWritten: 3 } })
    })

    await expect(h.run()).resolves.toEqual({ kind: 'delivered', handle: 'term_1', stages: [] })
  })
})
