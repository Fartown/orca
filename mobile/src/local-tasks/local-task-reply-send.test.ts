import { describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'ios' }
}))

import type { LocalTaskSessionLink } from '../../../src/shared/local-tasks/local-task-link-types'
import { FakeSession } from '../transport/mobile-endpoint-supervisor-test-fakes'
import type { RpcResponse } from '../transport/types'
import { sendLocalTaskReply } from './local-task-reply-send'

const LEAF_A = '11111111-1111-4111-8111-111111111111'
const LEAF_B = '22222222-2222-4222-8222-222222222222'

function terminalSession(extra: Partial<LocalTaskSessionLink>): LocalTaskSessionLink {
  return {
    id: 's1',
    taskId: 't1',
    hostId: 'local',
    worktreeId: 'repo::/shop-13',
    instanceId: null,
    surface: 'terminal',
    tabId: 'tab-1',
    paneKey: `tab-1:${LEAF_A}`,
    sessionId: null,
    providerSession: null,
    agent: 'claude',
    linkedVia: 'start',
    openedAt: 1,
    ...extra
  }
}

function host(sendAccepted: boolean) {
  const client = new FakeSession('connected')
  client.sendRequest.mockImplementation(async (method: string): Promise<RpcResponse> => {
    if (method === 'terminal.list') {
      return {
        id: 'list',
        ok: true,
        result: {
          terminals: [
            { handle: 'term-a', tabId: 'tab-1', leafId: LEAF_A },
            { handle: 'term-b', tabId: 'tab-1', leafId: LEAF_B }
          ]
        }
      }
    }
    return sendAccepted
      ? { id: 'send', ok: true, result: { send: { accepted: true } } }
      : { id: 'send', ok: false, error: { code: 'terminal_input_locked', message: 'locked' } }
  })
  return client
}

describe('a "Needs you" reply into a terminal session', () => {
  it("types into the linked pane's terminal once", async () => {
    const client = host(true)
    const outcome = await sendLocalTaskReply({
      client,
      session: terminalSession({}),
      text: 'run the tests',
      missing: 'gone'
    })
    expect(outcome).toEqual({ kind: 'delivered' })
    const sends = client.sendRequest.mock.calls.filter(([method]) => method === 'terminal.send')
    expect(sends).toHaveLength(1)
    expect(sends[0]?.[1]).toMatchObject({ terminal: 'term-a', text: 'run the tests', enter: true })
  })

  it('sends nothing when a tab-only link names no single pane, or the host refuses', async () => {
    const client = host(true)
    expect(
      await sendLocalTaskReply({
        client,
        session: terminalSession({ paneKey: null }),
        text: 'x',
        missing: 'gone'
      })
    ).toEqual({ kind: 'not-sent', reason: 'gone' })
    expect(client.sendRequest.mock.calls.some(([method]) => method === 'terminal.send')).toBe(false)
    const refusing = host(false)
    expect(
      await sendLocalTaskReply({
        client: refusing,
        session: terminalSession({}),
        text: 'x',
        missing: 'gone'
      })
    ).toMatchObject({ kind: 'not-sent' })
  })
})
