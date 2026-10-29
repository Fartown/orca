import { describe, expect, it, vi } from 'vitest'
vi.mock('react-native', () => ({ AppState: { currentState: 'active' } }))
import { FakeSession } from '../transport/mobile-endpoint-supervisor-test-fakes'
import { localTaskEndpointFor, SELF_LOCAL_TASK_ENDPOINT } from './local-task-endpoint'
import { readLocalTaskHostContact } from './local-task-host-contact'

describe('task launch contact gate', () => {
  it('does not read a host when the library host is disconnected', async () => {
    const client = new FakeSession('disconnected')
    expect(await readLocalTaskHostContact(client, SELF_LOCAL_TASK_ENDPOINT, 'ssh:box')).toEqual({
      kind: 'unverifiable'
    })
    expect(client.sendRequest).not.toHaveBeenCalled()
  })

  it("refuses the paired host's SSH target whose connection verdict is disconnected", async () => {
    const client = new FakeSession('connected')
    client.sendRequest.mockResolvedValue({
      id: 'state',
      ok: true,
      result: {
        state: { targetId: 'box', status: 'disconnected', error: null, reconnectAttempt: 0 }
      }
    })
    expect(await readLocalTaskHostContact(client, SELF_LOCAL_TASK_ENDPOINT, 'ssh:box')).toEqual({
      kind: 'out-of-contact'
    })
    expect(client.sendRequest).toHaveBeenCalledTimes(1)
  })

  it("leaves a server's own SSH targets to the server and asks nobody", async () => {
    const client = new FakeSession('connected')
    expect(
      await readLocalTaskHostContact(client, localTaskEndpointFor('runtime:vm'), 'ssh:box')
    ).toEqual({ kind: 'in-contact' })
    expect(client.sendRequest).not.toHaveBeenCalled()
  })
})
