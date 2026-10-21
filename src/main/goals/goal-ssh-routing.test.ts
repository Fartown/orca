import { expect, it, vi } from 'vitest'
import { routeGoalRequest } from './goal-ssh-routing'
import type { RpcContext } from '../runtime/rpc/core'

// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: Host admission does not read any runtime methods.
const context = {} as RpcContext
const ready = {
  status: 'ready',
  reason: null,
  supports: { localTerminal: true, structured: false, ssh: false, wsl: false }
} as const

it('runs the Goal on the selected runtime, including a client connected to SSH orcad', () => {
  const local = vi.fn(() => ready)
  expect(
    routeGoalRequest('goals.status', { authorityExecutionHostId: 'local' }, context, local)
  ).toEqual(ready)
  expect(local).toHaveBeenCalledOnce()
})

it.each(['ssh:old-host', 'runtime:another-host'])(
  'refuses a second host without reading the local store (%s)',
  (host) => {
    const local = vi.fn(() => ready)
    expect(() =>
      routeGoalRequest('goals.status', { authorityExecutionHostId: host }, context, local)
    ).toThrow('Orca Server connection')
    expect(local).not.toHaveBeenCalled()
  }
)
