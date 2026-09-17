import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toSshExecutionHostId } from '../../shared/execution-host'
import type {
  ArtifactShareHostListing,
  ArtifactShareServiceStatus
} from '../../shared/self-hosted-artifacts/artifact-share-contract'
import { ARTIFACT_SHARE_RELAY_METHODS } from '../../shared/self-hosted-artifacts/artifact-share-contract'
import { rememberArtifactShareHost } from './artifact-share-known-hosts'
import type { ArtifactShareOwnerService } from './artifact-share-owner-service'
import { registerArtifactShareRuntime } from './artifact-share-runtime-registry'

const { getActiveMultiplexer } = vi.hoisted(() => ({ getActiveMultiplexer: vi.fn() }))

vi.mock('../ssh/ssh-target-registry', () => ({
  getActiveMultiplexer,
  listRegisteredSshTargets: () => [
    { id: 'minizc', label: 'Mac mini' },
    { id: 'offline', label: 'Old laptop' }
  ]
}))

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
    callRuntimeEnvironment: vi.fn()
  })
  getActiveMultiplexer.mockReset()
  getActiveMultiplexer.mockImplementation((targetId: string) =>
    targetId === 'minizc'
      ? {
          request: async (method: string) => {
            expect(method).toBe(ARTIFACT_SHARE_RELAY_METHODS.list)
            return { ok: true, value: listing('minizc.local') }
          }
        }
      : undefined
  )
})

afterEach(async () => {
  registerArtifactShareRuntime(null)
  await rm(userDataPath, { recursive: true, force: true })
})

describe('artifactShare.list', () => {
  it('groups this computer, connected hosts, and hosts shared to before', async () => {
    rememberArtifactShareHost(userDataPath, toSshExecutionHostId('offline'))

    const result = await listArtifactShareHosts({}, {})

    expect(result.hosts.map((host) => [host.host, host.service.state])).toEqual([
      [{ executionHostId: 'local', label: 'mbp5' }, 'serving'],
      [{ executionHostId: toSshExecutionHostId('minizc'), label: 'Mac mini' }, 'serving'],
      [{ executionHostId: toSshExecutionHostId('offline'), label: 'Old laptop' }, 'unverifiable']
    ])
    expect(result.hosts[2]?.service).toEqual({ state: 'unverifiable', reason: 'disconnected' })
  })

  it('shows a paired caller only the computer it paired with', async () => {
    rememberArtifactShareHost(userDataPath, toSshExecutionHostId('offline'))

    const result = await listArtifactShareHosts({}, { clientKind: 'runtime', pairedDeviceId: 'p1' })

    expect(result.hosts.map((host) => host.host.executionHostId)).toEqual(['local'])
    expect(getActiveMultiplexer).not.toHaveBeenCalled()
  })

  it('reports an outdated host instead of an empty list', async () => {
    getActiveMultiplexer.mockImplementation(() => ({
      request: async () => {
        throw Object.assign(new Error('Method not found'), { code: -32601 })
      }
    }))

    const result = await listArtifactShareHosts(
      { executionHostIds: [toSshExecutionHostId('minizc')] },
      {}
    )

    expect(result.hosts[0]?.service).toEqual({ state: 'unverifiable', reason: 'host-outdated' })
  })
})
