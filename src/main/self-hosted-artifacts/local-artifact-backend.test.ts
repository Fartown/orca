import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { isPackaged: false },
  safeStorage: { isEncryptionAvailable: () => false }
}))

import { ArtifactCloudService } from '../artifacts/artifact-cloud-service'

let userDataPath: string
let service: ArtifactCloudService

beforeEach(async () => {
  userDataPath = await mkdtemp(join(tmpdir(), 'orca-local-artifact-'))
  service = new ArtifactCloudService(userDataPath, () => true)
  vi.stubEnv('ORCA_ARTIFACTS_API_URL', undefined)
  vi.stubEnv('NODE_ENV', 'test')
})

afterEach(async () => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  await rm(userDataPath, { recursive: true, force: true })
})

it('requests the local HTTP backend without launch environment configuration', async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ artifacts: [] }))
  vi.stubGlobal('fetch', fetchMock)

  await expect(service.list({ authToken: 'test-token' })).resolves.toEqual({
    status: 'ok',
    value: { artifacts: [] }
  })
  expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8787/v1/artifacts', expect.any(Object))
})

it('retains explicit origin and environment override precedence', async () => {
  const fetchMock = vi
    .fn()
    .mockImplementation(() => Promise.resolve(Response.json({ artifacts: [] })))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('ORCA_ARTIFACTS_API_URL', 'http://192.168.1.5:8787')

  await service.list({ authToken: 'test-token' })
  await service.list({ apiUrl: 'http://localhost:9000', authToken: 'test-token' })

  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
    'http://192.168.1.5:8787/v1/artifacts',
    'http://localhost:9000/v1/artifacts'
  ])
})

it('reports a local connection failure without retrying against the cloud', async () => {
  const failure = new TypeError('fetch failed')
  const fetchMock = vi.fn().mockRejectedValue(failure)
  vi.stubGlobal('fetch', fetchMock)

  await expect(service.list({ authToken: 'test-token' })).rejects.toBe(failure)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8787/v1/artifacts', expect.any(Object))
})
