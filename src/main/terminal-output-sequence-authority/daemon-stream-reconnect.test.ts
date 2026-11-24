import '../daemon/pty-subprocess/testing/mock-descendant-sweep'
import { expect, it } from 'vitest'
import { rmSync } from 'node:fs'
import type { Socket } from 'node:net'
import { DaemonPtyAdapter } from '../daemon/providers/adapter/daemon-pty-adapter'
import { getDaemonSocketPath } from '../daemon/launch/daemon-spawner'
import {
  createMockSubprocess,
  startDaemonAdapterHarness,
  waitFor
} from '../daemon/providers/adapter/testing/daemon-pty-adapter-test-harness'
import { createSideEffectRuntime } from '../runtime/construction/test-context/orca-runtime-test-scenario-builders.spec'
import { syncSinglePty } from '../runtime/construction/test-context/orca-runtime-test-fixtures.spec'

it('keeps legacy daemon snapshots and new echo in one domain through real reconnect sockets', async () => {
  const subprocess = createMockSubprocess()
  const harness = await startDaemonAdapterHarness(() => subprocess)
  const first = harness.adapter
  let second: DaemonPtyAdapter | undefined
  const { runtime } = createSideEffectRuntime()
  syncSinglePty(runtime)
  const frames: { data: string; seq?: number }[] = []
  const bind = (provider: DaemonPtyAdapter) =>
    provider.onData((event) =>
      runtime.onPtyData(
        'pty-1',
        event.data,
        0,
        event.sequenceChars ?? event.data.length,
        event.transformed
      )
    )
  bind(first)
  const unsubscribe = runtime.subscribeToTerminalData('pty-1', (data, meta) =>
    frames.push({ data, seq: meta?.seq })
  )
  try {
    const created = await first.spawn({ sessionId: 'stream-reconnect', cols: 80, rows: 24 })
    runtime.synchronizePtyOutputSequenceFromProvider('pty-1', created.providerSequence!, 0)
    subprocess._simulateData('before')
    await waitFor(() => frames.length > 0)
    const before = runtime.getPtyOutputSequence('pty-1')
    await first.disconnectOnly()
    subprocess._simulateData('missed while disconnected\r\n')
    second = new DaemonPtyAdapter({ socketPath: harness.socketPath, tokenPath: harness.tokenPath })
    bind(second)
    const attached = await second.spawn({ sessionId: 'stream-reconnect', cols: 80, rows: 24 })
    const snapshotSeq = attached.providerSequence!.value
    expect(attached.pid).toBe(created.pid)
    expect(attached.incarnationId).toBe(created.incarnationId)
    expect(attached.providerSequence!.streamPosition).toBe(snapshotSeq)
    expect(
      runtime.synchronizePtyOutputSequenceFromProvider('pty-1', attached.providerSequence!, before)
    ).toBe(snapshotSeq)
    subprocess._simulateData('new echo')
    await waitFor(() => frames.some((frame) => frame.data === 'new echo'))
    expect(frames.find((frame) => frame.data === 'new echo')?.seq).toBe(
      snapshotSeq + 'new echo'.length
    )
    expect(runtime.getPtyOutputSequence('pty-1')).toBe(
      harness.server.host.getSnapshot('stream-reconnect')?.outputSequence
    )
  } finally {
    unsubscribe()
    first.dispose()
    second?.dispose()
    await harness.server.shutdown()
    rmSync(harness.dir, { recursive: true, force: true })
  }
})

it('does not double count an existing stream whose data crosses the attach response', async () => {
  const subprocess = createMockSubprocess()
  const harness = await startDaemonAdapterHarness(() => subprocess)
  const { runtime } = createSideEffectRuntime()
  syncSinglePty(runtime)
  harness.adapter.onData((event) =>
    runtime.onPtyData(
      'pty-1',
      event.data,
      0,
      event.sequenceChars ?? event.data.length,
      event.transformed
    )
  )
  try {
    const created = await harness.adapter.spawn({ sessionId: 'queued-data', cols: 80, rows: 24 })
    runtime.synchronizePtyOutputSequenceFromProvider('pty-1', created.providerSequence!, 0)
    subprocess._simulateData('queued data')
    const before = runtime.getPtyOutputSequence('pty-1')
    const attached = await harness.adapter.spawn({ sessionId: 'queued-data', cols: 80, rows: 24 })
    runtime.synchronizePtyOutputSequenceFromProvider('pty-1', attached.providerSequence!, before)
    await waitFor(() => runtime.getPtyOutputSequence('pty-1') >= 'queued data'.length)
    expect(runtime.getPtyOutputSequence('pty-1')).toBe('queued data'.length)
  } finally {
    harness.adapter.dispose()
    await harness.server.shutdown()
    rmSync(harness.dir, { recursive: true, force: true })
  }
})

it('rebases the same adapter after a real socket loss with a fresh attachment lease', async () => {
  const { createServer, connect } = await import('node:net')
  const subprocess = createMockSubprocess()
  const harness = await startDaemonAdapterHarness(() => subprocess)
  const proxyPath = getDaemonSocketPath(harness.dir, 1)
  const links = new Set<Socket>()
  const leases = new Set<string>()
  const proxy = createServer((incoming) => {
    const outgoing = connect(harness.socketPath)
    for (const socket of [incoming, outgoing]) {
      links.add(socket)
      socket.on('error', () => socket.destroy())
      socket.once('close', () => links.delete(socket))
    }
    let helloBytes = ''
    const observeHello = (chunk: Buffer): void => {
      helloBytes += chunk.toString()
      if (!helloBytes.includes('\n')) {
        return
      }
      incoming.off('data', observeHello)
      const hello = JSON.parse(helloBytes.split('\n')[0])
      if (hello.type === 'hello') {
        leases.add(hello.clientId)
      }
    }
    incoming.on('data', observeHello)
    incoming.pipe(outgoing)
    outgoing.pipe(incoming)
    incoming.once('close', () => outgoing.destroy())
    outgoing.once('close', () => incoming.destroy())
  })
  await new Promise<void>((resolve) => proxy.listen(proxyPath, resolve))
  class ObservedAdapter extends DaemonPtyAdapter {
    transportConnected(): boolean {
      return this.client.isConnected()
    }
  }
  const adapter = new ObservedAdapter({ socketPath: proxyPath, tokenPath: harness.tokenPath })
  const { runtime } = createSideEffectRuntime()
  syncSinglePty(runtime)
  adapter.onData((event) =>
    runtime.onPtyData(
      'pty-1',
      event.data,
      0,
      event.sequenceChars ?? event.data.length,
      event.transformed
    )
  )
  try {
    const created = await adapter.spawn({ sessionId: 'same-adapter', cols: 80, rows: 24 })
    runtime.synchronizePtyOutputSequenceFromProvider('pty-1', created.providerSequence!, 0)
    subprocess._simulateData('before')
    await waitFor(() => runtime.getPtyOutputSequence('pty-1') === 6)
    for (const socket of links) {
      socket.destroy()
    }
    await waitFor(() => !adapter.transportConnected())
    subprocess._simulateData('missed output\r\n')
    const attached = await adapter.spawn({ sessionId: 'same-adapter', cols: 80, rows: 24 })
    expect(attached.incarnationId).toBe(created.incarnationId)
    expect(leases.size).toBe(2)
    const baseline = attached.providerSequence!.value
    expect(
      runtime.synchronizePtyOutputSequenceFromProvider('pty-1', attached.providerSequence!, 6)
    ).toBe(baseline)
    subprocess._simulateData('echo')
    await waitFor(() => runtime.getPtyOutputSequence('pty-1') === baseline + 4)
  } finally {
    adapter.dispose()
    harness.adapter.dispose()
    for (const socket of links) {
      socket.destroy()
    }
    await new Promise<void>((resolve) => proxy.close(() => resolve()))
    await harness.server.shutdown()
    rmSync(harness.dir, { recursive: true, force: true })
  }
})
