import { describe, expect, it, vi } from 'vitest'
import type * as SubscriptionSelection from '../hooks/ipc-events/runtime-environment-subscription-selection'
import type { SshConnectionStatus } from '../../../shared/ssh-types'

const reachable = vi.hoisted((): { ids: string[] } => ({ ids: [] }))
vi.mock(
  '../hooks/ipc-events/runtime-environment-subscription-selection',
  async (importOriginal) => ({
    ...(await importOriginal<typeof SubscriptionSelection>()),
    getReachableRuntimeEnvironmentIds: () => reachable.ids
  })
)

import { isGoalHostInContact, type GoalHostContactState } from './goal-host-contact'

function state(sshStatus: SshConnectionStatus | null): GoalHostContactState {
  return {
    runtimeEnvironments: [],
    runtimeStatusByEnvironmentId: new Map(),
    settings: null,
    sshStateByEnvironment: new Map(),
    sshConnectionStates: new Map(
      sshStatus
        ? [['box', { targetId: 'box', status: sshStatus, error: null, reconnectAttempt: 0 }]]
        : []
    )
  }
}

describe('isGoalHostInContact', () => {
  it('reads the local host always and nothing it cannot parse', () => {
    expect(isGoalHostInContact(state(null), 'local')).toBe(true)
    expect(isGoalHostInContact(state(null), 'not a host')).toBe(false)
  })

  it('follows the SSH connection manager, including while it is reconnecting', () => {
    expect(isGoalHostInContact(state('connected'), 'ssh:box')).toBe(true)
    expect(isGoalHostInContact(state('reconnecting'), 'ssh:box')).toBe(false)
    expect(isGoalHostInContact(state(null), 'ssh:box')).toBe(false)
  })

  it('follows the shared runtime contact verdict for paired hosts', () => {
    reachable.ids = []
    expect(isGoalHostInContact(state(null), 'runtime:env-a')).toBe(false)
    reachable.ids = ['env-a']
    expect(isGoalHostInContact(state(null), 'runtime:env-a')).toBe(true)
  })
})
