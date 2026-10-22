import { describe, expect, it } from 'vitest'
import {
  buildExecutionHostInventory,
  buildExecutionHostRegistry,
  type ExecutionHostRegistryInput
} from '../../../shared/execution-host-registry'
import { sidebarHostOptionsFromInventory } from '../components/sidebar/sidebar-host-options'

describe('Issue host inventory', () => {
  it('uses configured and row-owned hosts, never a focus-only default', () => {
    const input: ExecutionHostRegistryInput = {
      repos: [{ executionHostId: 'runtime:owner', connectionId: null }],
      settings: { activeRuntimeEnvironmentId: 'focus-only' },
      runtimeEnvironments: [{ id: 'owner', name: 'Execution owner' }],
      sshTargetLabels: new Map([['ssh-owner', 'SSH owner']])
    }
    const inventory = buildExecutionHostInventory(input)
    expect(inventory.map((host) => host.id)).toEqual(['local', 'runtime:owner', 'ssh:ssh-owner'])
    expect(buildExecutionHostRegistry(input).some((host) => host.id === 'runtime:focus-only')).toBe(
      true
    )
    const options = sidebarHostOptionsFromInventory(input, inventory)
    expect(options.find((host) => host.id === 'runtime:owner')?.label).toBe('Execution owner')
    expect(options.some((host) => host.id === 'runtime:focus-only')).toBe(false)
  })
})
