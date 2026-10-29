import { describe, expect, it } from 'vitest'
import { ProjectSectionCatalogSchema } from '../../../src/shared/project-section-catalog-schema'
import { localTaskEndpointFor } from './local-task-endpoint'
import { localTaskSetupsFor, pickLocalTaskStartSetup } from './local-task-project-setups'

// The paired host's catalog: its own checkouts, one over SSH, and two on the server it relays to,
// which the paired host adopts as `runtime:vm` with the server's own host in `executionHostId`.
const catalog = ProjectSectionCatalogSchema.parse({
  repos: [],
  projects: [
    { id: 'github:acme/web', displayName: 'web' },
    { id: 'github:acme/api', displayName: 'api' },
    { id: 'github:acme/ops', displayName: 'ops' }
  ],
  setups: [
    setup('web-local', 'github:acme/web', 'local', 'repo-web'),
    setup('web-box', 'github:acme/web', 'ssh:box', 'repo-web'),
    setup('api-local', 'github:acme/api', 'local', 'repo-api'),
    setup('ops-vm', 'github:acme/ops', 'runtime:vm', 'repo-ops', 'runtime:vm'),
    setup('ops-vm-box', 'github:acme/ops', 'runtime:vm', 'repo-ops-box', 'ssh:box')
  ],
  projectOrderBy: 'manual'
})

function setup(
  id: string,
  projectId: string,
  hostId: string,
  repoId: string,
  executionHostId?: string
) {
  return {
    id,
    projectId,
    hostId,
    repoId,
    path: `/${id}`,
    displayName: id,
    setupMethod: 'cloned',
    ...(executionHostId ? { executionHostId } : {})
  }
}

describe('where Start can create a workspace', () => {
  it('offers every repo on the library host when the project has none, and only that host', () => {
    // The server's own `ssh:box` repo is not the paired host's `ssh:box`, so it stays out here.
    const own = localTaskSetupsFor(catalog, localTaskEndpointFor(undefined), [])
    expect(own.map((entry) => entry.label)).toEqual(['web-local', 'web-box', 'api-local'])
    const server = localTaskSetupsFor(catalog, localTaskEndpointFor('runtime:vm'), [])
    // A server's checkout is `runtime:vm` to the phone and its own host to the server's library.
    expect(server.map((entry) => [entry.label, entry.hostId, entry.ownerHostId])).toEqual([
      ['ops-vm', 'runtime:vm', 'local'],
      ['ops-vm-box', 'runtime:vm', 'ssh:box']
    ])
  })

  it("lists the project's repos in its order and preselects the default on the last host", () => {
    const setups = localTaskSetupsFor(catalog, localTaskEndpointFor(undefined), [
      'github:acme/api',
      'github:acme/web'
    ])
    expect(setups.map((entry) => entry.label)).toEqual(['api-local', 'web-local', 'web-box'])
    expect(
      pickLocalTaskStartSetup(setups, {
        defaultRepoId: 'github:acme/web',
        lastExecutionHostId: 'ssh:box'
      })?.label
    ).toBe('web-box')
    expect(
      pickLocalTaskStartSetup(setups, {
        defaultRepoId: 'github:acme/web',
        lastExecutionHostId: null
      })?.label
    ).toBe('web-local')
  })
})
