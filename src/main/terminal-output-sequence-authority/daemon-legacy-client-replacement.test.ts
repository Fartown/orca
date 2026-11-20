import '../daemon/pty-subprocess/testing/mock-descendant-sweep'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connect, type Socket } from 'node:net'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { DaemonServer } from '../daemon/server/daemon-server'
import { getDaemonSocketPath } from '../daemon/launch/daemon-spawner'
import { encodeNdjson } from '../../shared/json-stream/main-process-ndjson-framer'
import { PROTOCOL_VERSION } from '../daemon/protocol/daemon-protocol-version'
import { createMockSubprocess } from '../daemon/providers/adapter/testing/daemon-pty-adapter-test-harness'

type DaemonServerPrivate = {
  preparations: { pending: Map<string, Set<unknown>> }
}

// Ported from upstream's daemon-preflight-client-replacement suite (#42777 removed it). DaemonClient now
// mints a fresh lease per connection, so only an older client still reuses one ID across reconnects.
describe('legacy same-ID daemon client replacement', () => {
  let dir: string
  let server: DaemonServer

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'daemon-legacy-replacement-'))
  })

  afterEach(async () => {
    await server?.shutdown()
    rmSync(dir, { recursive: true, force: true })
  })

  async function connectDaemonSocketPair(
    socketPath: string,
    tokenPath: string,
    clientId: string
  ): Promise<{ control: Socket; stream: Socket }> {
    const token = readFileSync(tokenPath, 'utf-8').trim()
    const connectRole = async (role: 'control' | 'stream'): Promise<Socket> => {
      const socket = connect(socketPath)
      await new Promise<void>((resolve) => socket.once('connect', resolve))
      socket.write(
        encodeNdjson({ type: 'hello', version: PROTOCOL_VERSION, token, clientId, role })
      )
      await new Promise<void>((resolve) => socket.once('data', () => resolve()))
      return socket
    }
    return { control: await connectRole('control'), stream: await connectRole('stream') }
  }

  it('cancels preparation when a reconnect replaces the owning control socket', async () => {
    let finishPreparation!: () => void
    const preparation = new Promise<void>((resolve) => {
      finishPreparation = resolve
    })
    const preparePtySpawn = vi.fn(() => preparation)
    const spawnSubprocess = vi.fn(() => createMockSubprocess())
    const socketPath = getDaemonSocketPath(dir)
    const tokenPath = join(dir, 'daemon.token')
    server = new DaemonServer({ socketPath, tokenPath, preparePtySpawn, spawnSubprocess })
    await server.start()

    const original = await connectDaemonSocketPair(socketPath, tokenPath, 'reused-client-id')
    original.control.write(
      encodeNdjson({
        id: 'replacement-request',
        type: 'createOrAttach',
        payload: { sessionId: 'replacement-pending', cols: 80, rows: 24 }
      })
    )
    await vi.waitFor(() => expect(preparePtySpawn).toHaveBeenCalledOnce())

    const replacement = await connectDaemonSocketPair(socketPath, tokenPath, 'reused-client-id')
    finishPreparation()
    await vi.waitFor(() =>
      expect((server as unknown as DaemonServerPrivate).preparations.pending.size).toBe(0)
    )
    expect(spawnSubprocess).not.toHaveBeenCalled()

    replacement.control.destroy()
    replacement.stream.destroy()
    original.control.destroy()
    original.stream.destroy()
  })
})
