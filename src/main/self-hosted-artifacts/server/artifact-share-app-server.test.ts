import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readArtifactShareConfig } from '../store/artifact-share-config'
import { readArtifactShareServingState } from '../store/artifact-share-serving-state'
import { ArtifactShareAppServer } from './artifact-share-app-server'
import {
  createArtifactShareSandbox,
  fetchLocal,
  findFreePort,
  occupyPort,
  usePreferredPort,
  type ArtifactShareSandbox
} from './artifact-share-test-fixtures'

let sandbox: ArtifactShareSandbox
const servers: ArtifactShareAppServer[] = []

function newServer(): ArtifactShareAppServer {
  const server = new ArtifactShareAppServer({
    home: sandbox.home,
    computerLabel: 'test-computer',
    viewer: null,
    listIpCandidates: async () => ['10.0.0.5']
  })
  servers.push(server)
  return server
}

beforeEach(async () => {
  sandbox = await createArtifactShareSandbox()
})

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()))
  await sandbox.cleanup()
})

describe('ArtifactShareAppServer', () => {
  it('serves on the preferred port, records its identity, and stops cleanly', async () => {
    const port = await findFreePort()
    await usePreferredPort(sandbox.home, port)
    const server = newServer()
    await server.setEnabled(true)
    await expect(server.status()).resolves.toEqual({
      state: 'serving',
      port,
      ip: '10.0.0.5',
      ipCandidates: ['10.0.0.5'],
      ipChoice: 'auto'
    })
    expect(readArtifactShareConfig(sandbox.home).confirmedPort).toBe(port)
    const identity = await fetchLocal(port, '/_share/identity')
    expect(JSON.parse(identity.body)).toMatchObject({
      service: 'orca-artifact-share',
      instance: readArtifactShareServingState(sandbox.home)?.instance
    })
    await server.stop()
    expect(readArtifactShareServingState(sandbox.home)?.state).toBe('stopped')
    await expect(fetchLocal(port, '/_share/identity')).rejects.toThrow()
  })

  it('falls back to a free port the first time the preferred one is taken', async () => {
    const port = await findFreePort()
    await usePreferredPort(sandbox.home, port)
    const release = await occupyPort(port)
    try {
      const server = newServer()
      await server.setEnabled(true)
      const status = await server.status()
      expect(status.state).toBe('serving')
      const chosen = status.state === 'serving' ? status.port : 0
      expect(chosen).not.toBe(port)
      expect(chosen).toBeGreaterThanOrEqual(20_000)
      expect(readArtifactShareConfig(sandbox.home).confirmedPort).toBe(chosen)
    } finally {
      await release()
    }
  })

  it('reports a conflict instead of moving once a port is confirmed, and recovers on restart', async () => {
    const port = await findFreePort()
    await usePreferredPort(sandbox.home, port)
    const first = newServer()
    await first.setEnabled(true)
    await first.stop()
    const release = await occupyPort(port)
    const server = newServer()
    await server.setEnabled(true)
    await expect(server.status()).resolves.toEqual({ state: 'port-conflict', port })
    await release()
    await server.restart()
    await expect(server.status()).resolves.toMatchObject({ state: 'serving', port })
  })

  it('records sharing-off when disabled', async () => {
    const server = newServer()
    await server.setEnabled(false)
    await expect(server.status()).resolves.toEqual({ state: 'sharing-off' })
    expect(readArtifactShareServingState(sandbox.home)?.state).toBe('sharing-off')
  })

  it('lets a second app use the running server and take over after it quits', async () => {
    const port = await findFreePort()
    await usePreferredPort(sandbox.home, port)
    const owner = newServer()
    await owner.setEnabled(true)
    const second = newServer()
    await second.setEnabled(true)
    await expect(second.status()).resolves.toMatchObject({ state: 'serving', port })
    await owner.stop()
    await expect(second.status()).resolves.toMatchObject({ state: 'serving', port })
    await expect(fetchLocal(port, '/_share/identity')).resolves.toMatchObject({ status: 200 })
  })
})
