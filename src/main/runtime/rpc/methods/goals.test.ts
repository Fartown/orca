import { setSshActiveMultiplexerResolver } from '../../../ssh/ssh-target-registry'
import { afterEach, describe, expect, it } from 'vitest'
import { GOAL_METHOD_NAMES } from '../../../../shared/goals/goal-control-contract'
import type { GoalControlService } from '../../../goals/goal-control-service'
import type { RpcContext, RpcMethod } from '../core'
import { GOAL_METHODS, goalFeatureReadinessRegistry } from './goals'
import { ALL_RPC_METHODS } from './index'

afterEach(() => {
  goalFeatureReadinessRegistry.setUnavailable('service-stopped')
  setSshActiveMultiplexerResolver(null)
})

describe('Goal runtime RPC manifest', () => {
  it('registers exactly the contract methods and answers status without a service', () => {
    expect(GOAL_METHODS.map((method) => method.name)).toEqual([...GOAL_METHOD_NAMES])
    expect(
      ALL_RPC_METHODS.filter((method) =>
        (GOAL_METHOD_NAMES as readonly string[]).includes(method.name)
      )
    ).toHaveLength(GOAL_METHOD_NAMES.length)
    expect(call('goals.status', { authorityExecutionHostId: 'local' }, {})).toMatchObject({
      status: 'unavailable',
      reason: expect.stringMatching(/^service-/),
      supports: { localTerminal: true, ssh: false }
    })
  })

  it('reports degraded hook evidence and a missing driver bundle distinctly', () => {
    const service = {} as GoalControlService
    const stop = goalFeatureReadinessRegistry.register(service, {
      driverEntry: 'ready',
      hookEvidence: 'disabled'
    })
    expect(call('goals.status', { authorityExecutionHostId: 'local' }, {})).toMatchObject({
      status: 'degraded',
      reason: 'hook-disabled'
    })
    stop()
    goalFeatureReadinessRegistry.register(service, {
      driverEntry: 'missing',
      hookEvidence: 'ready'
    })
    expect(call('goals.status', { authorityExecutionHostId: 'local' }, {})).toMatchObject({
      status: 'unavailable',
      reason: 'driver-bundle-missing'
    })
  })

  it('refuses paired second-hop routing and never falls back locally for a disconnected SSH host', () => {
    setSshActiveMultiplexerResolver(() => undefined)
    expect(() =>
      call(
        'goals.status',
        { authorityExecutionHostId: 'ssh:known' },
        { clientId: 'phone', clientKind: 'runtime', pairedDeviceId: 'device' }
      )
    ).toThrow(/second SSH host/)
    expect(() => call('goals.status', { authorityExecutionHostId: 'ssh:known' }, {})).toThrow(
      /disconnected/
    )
    expect(() =>
      call('goals.list', { authorityExecutionHostId: 'local', filter: 'all' }, {})
    ).toThrow(/unavailable/)
  })

  it('validates params through the shared contract schema', () => {
    const method = GOAL_METHODS.find((entry) => entry.name === 'goals.control') as RpcMethod
    expect(
      method.params?.safeParse({ authorityExecutionHostId: 'local', action: 'stop' }).success
    ).toBe(false)
  })
})

function call(name: string, params: unknown, context: Partial<RpcContext>): unknown {
  const method = GOAL_METHODS.find((entry) => entry.name === name) as RpcMethod
  const parsed = method.params ? method.params.parse(params) : params
  return method.handler(parsed, context as RpcContext)
}
