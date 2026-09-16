import { afterEach, expect, it, vi } from 'vitest'
import { routeGoalRequest } from './goal-ssh-routing'
import type { RpcContext } from '../runtime/rpc/core'
import { getActiveMultiplexer } from '../ssh/ssh-target-registry'

const { request, onRequest } = vi.hoisted(() => ({ request: vi.fn(), onRequest: vi.fn() }))
vi.mock('../ssh/ssh-target-registry', () => ({
  getActiveMultiplexer: vi.fn(() => ({ request, onRequest }))
}))
afterEach(() => vi.clearAllMocks())
const ready = {
  status: 'ready',
  reason: null,
  supports: { localTerminal: true, structured: false, ssh: true, wsl: false }
} as const
// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: Status routing does not call runtime methods; callback-specific tests provide the method they exercise.
const context = { runtime: {} } as RpcContext

it('forwards the original mutation envelope to SSH and never invokes the local service', async () => {
  request.mockResolvedValue(ready)
  const local = vi.fn(() => ready)
  const params = { authorityExecutionHostId: 'ssh:remote' }
  await expect(routeGoalRequest('goals.status', params, context, local)).resolves.toEqual(ready)
  expect(getActiveMultiplexer).toHaveBeenCalledWith('remote')
  expect(request).toHaveBeenCalledWith('goals.status', params)
  expect(local).not.toHaveBeenCalled()
})

it('does not fall back when an older relay rejects the method', async () => {
  request.mockRejectedValue(new Error('Method not found: goals.status'))
  const local = vi.fn(() => ready)
  await expect(
    routeGoalRequest('goals.status', { authorityExecutionHostId: 'ssh:old' }, context, local)
  ).rejects.toThrow('Method not found')
  expect(local).not.toHaveBeenCalled()
})
