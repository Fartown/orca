import { expect, it } from 'vitest'

import {
  buildExecutionHostRegistry,
  buildExecutionHostRegistryForAllHosts
} from '../execution-host/execution-host-registry'

it('lists owned hosts without adding an active-only runtime', () => {
  const args = {
    repos: [{ connectionId: 'remote' }],
    sshTargetLabels: new Map([['remote', 'Builder']]),
    runtimeEnvironments: [{ id: 'paired', name: 'Paired' }]
  }
  const allHosts = buildExecutionHostRegistryForAllHosts(args)
  const focused = buildExecutionHostRegistry({
    ...args,
    settings: { activeRuntimeEnvironmentId: 'focused-only' }
  })

  expect(allHosts.map((host) => host.id)).toEqual(['local', 'runtime:paired', 'ssh:remote'])
  expect(allHosts.find((host) => host.id === 'ssh:remote')?.label).toBe('Builder')
  expect(focused.map((host) => host.id)).toContain('runtime:focused-only')
})
