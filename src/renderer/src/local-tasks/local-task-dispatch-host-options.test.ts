import { describe, expect, it } from 'vitest'
import {
  buildSidebarHostOptions,
  buildSidebarHostOptionsForAllHosts
} from '@/components/sidebar/worktree-list/controls/sidebar-host-options'

describe('dispatch host options', () => {
  it('keeps explicit host choices independent of the active runtime', () => {
    const args = {
      repos: [{ connectionId: 'remote' }],
      sshTargetLabels: new Map([['remote', 'Builder']]),
      runtimeEnvironments: [{ id: 'paired', name: 'Paired', source: 'manual' as const }]
    }
    const allHosts = buildSidebarHostOptionsForAllHosts(args)
    const focused = buildSidebarHostOptions({
      ...args,
      settings: { activeRuntimeEnvironmentId: 'focused-only' }
    })

    expect(allHosts.map((host) => host.id)).toEqual(['local', 'runtime:paired', 'ssh:remote'])
    expect(allHosts.find((host) => host.id === 'ssh:remote')?.label).toBe('Builder')
    expect(allHosts.find((host) => host.id === 'runtime:paired')?.presence).toBe('project')
    expect(focused.map((host) => host.id)).toContain('runtime:focused-only')
  })
})
