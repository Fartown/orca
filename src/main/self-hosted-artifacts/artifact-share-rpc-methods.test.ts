import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ArtifactShareHostListing,
  ArtifactShareServiceStatus
} from '../../shared/self-hosted-artifacts/artifact-share-contract'
import { rememberArtifactShareHost } from './artifact-share-known-hosts'
import type { ArtifactShareOwnerService } from './artifact-share-owner-service'
import { registerArtifactShareRuntime } from './artifact-share-runtime-registry'

const { callRuntime, environments } = vi.hoisted(() => ({
  callRuntime: vi.fn(),
  environments: [
    { id: 'env-mini', name: 'Mac mini' },
    { id: 'offline', name: 'Old laptop' }
  ]
}))
vi.mock('../../shared/runtime-environment-store', () => ({ listEnvironments: () => environments }))

const { listArtifactShareHosts } = await import('../runtime/rpc/methods/artifact-share')

const SERVING: ArtifactShareServiceStatus = {
  state: 'serving',
  port: 18787,
  ip: '192.168.1.20',
  ipCandidates: ['192.168.1.20']
}

function listing(label: string): ArtifactShareHostListing {
  return { host: { executionHostId: 'local', label }, service: SERVING, workspaces: [] }
}

let userDataPath: string

beforeEach(async () => {
  userDataPath = await mkdtemp(join(tmpdir(), 'artifact-share-rpc-methods-'))
  const owner: ArtifactShareOwnerService = {
    status: vi.fn(),
    lookup: vi.fn(),
    share: vi.fn(),
    stopWorkspace: vi.fn(),
    list: async () => listing('mbp5')
  }
  registerArtifactShareRuntime({
    owner,
    userDataPath,
    configureLocal: vi.fn(),
    callRuntimeEnvironment: callRuntime,
    isEnvironmentReachable: (id) => id === 'env-mini'
  })
  callRuntime.mockReset()
  callRuntime.mockResolvedValue({ ok: true, result: listing('minizc.local') })
})

afterEach(async () => {
  registerArtifactShareRuntime(null)
  await rm(userDataPath, { recursive: true, force: true })
})

describe('artifactShare.list', () => {
  it('groups this computer, connected hosts, and hosts shared to before', async () => {
    rememberArtifactShareHost(userDataPath, 'runtime:offline')

    const result = await listArtifactShareHosts({}, {})

    expect(result.hosts.map((host) => [host.host, host.service.state])).toEqual([
      [{ executionHostId: 'local', label: 'mbp5' }, 'serving'],
      [{ executionHostId: 'runtime:env-mini', label: 'Mac mini' }, 'serving'],
      [{ executionHostId: 'runtime:offline', label: 'Old laptop' }, 'unverifiable']
    ])
    expect(result.hosts[2]?.service).toEqual({ state: 'unverifiable', reason: 'disconnected' })
  })

  it('shows a paired caller only the computer it paired with', async () => {
    rememberArtifactShareHost(userDataPath, 'runtime:offline')

    const result = await listArtifactShareHosts({}, { clientKind: 'runtime', pairedDeviceId: 'p1' })

    expect(result.hosts.map((host) => host.host.executionHostId)).toEqual(['local'])
    expect(callRuntime).not.toHaveBeenCalled()
  })

  it('reports an outdated host instead of an empty list', async () => {
    callRuntime.mockResolvedValue({
      ok: false,
      error: { code: 'method_not_found', message: 'old host' }
    })

    const result = await listArtifactShareHosts({ executionHostIds: ['runtime:env-mini'] }, {})

    expect(result.hosts[0]?.service).toEqual({ state: 'unverifiable', reason: 'host-outdated' })
  })
})
