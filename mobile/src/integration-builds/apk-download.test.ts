import { describe, expect, it } from 'vitest'
import { downloadResumableApk, type ApkDownloadPorts } from './apk-download'

const TAG = 'integration-1-aaaaaaaaaaaa'
const TOTAL = 1000

interface Step {
  status?: number
  error?: string
  stalled?: boolean
  wrote?: number
}

function harness(steps: Step[], cached?: { tag: string | null; bytes: number }) {
  const disk = { tag: cached?.tag ?? null, bytes: cached?.bytes ?? 0 }
  const offsets: number[] = []
  const delays: number[] = []
  let step = 0
  const ports: ApkDownloadPorts = {
    partialBytes: async () => disk.bytes,
    cachedTag: async () => disk.tag,
    discard: async () => {
      disk.bytes = 0
      disk.tag = null
    },
    claim: async (tag) => {
      disk.tag = tag
    },
    attempt: async (offset) => {
      offsets.push(offset)
      const next = steps[step]
      step += 1
      if (!next) {
        throw new Error(`unscripted attempt at offset ${offset}`)
      }
      disk.bytes = offset + (next.wrote ?? 0)
      if (next.error) {
        throw new Error(next.error)
      }
      return next.stalled ? null : (next.status ?? 200)
    },
    delay: async (ms) => {
      delays.push(ms)
    }
  }
  return { ports, disk, offsets, delays }
}

const run = (harnessed: ReturnType<typeof harness>, expectedBytes = TOTAL) =>
  downloadResumableApk({ tag: TAG, expectedBytes }, harnessed.ports)

describe('resumable integration APK download', () => {
  it('resumes a partial that belongs to the same release', async () => {
    const test = harness([{ status: 206, wrote: 400 }], { tag: TAG, bytes: 600 })
    await run(test)
    expect(test.offsets).toEqual([600])
    expect(test.delays).toEqual([])
  })

  it('starts over when the cached partial belongs to another release', async () => {
    const test = harness([{ status: 200, wrote: TOTAL }], {
      tag: 'integration-0-bbbbbbbbbbbb',
      bytes: 600
    })
    await run(test)
    expect(test.offsets).toEqual([0])
    expect(test.disk.tag).toBe(TAG)
  })

  it('keeps the bytes already written when the connection breaks', async () => {
    const test = harness([
      { error: 'Network request failed', wrote: 250 },
      { status: 206, wrote: 750 }
    ])
    await run(test)
    expect(test.offsets).toEqual([0, 250])
    expect(test.delays).toEqual([2000])
  })

  it('resumes after a stalled attempt is cancelled', async () => {
    const test = harness([
      { stalled: true, wrote: 120 },
      { status: 206, wrote: 880 }
    ])
    await run(test)
    expect(test.offsets).toEqual([0, 120])
  })

  it('drops the poisoned partial after a gateway error and retries from zero', async () => {
    const test = harness(
      [
        { status: 504, wrote: 90 },
        { status: 200, wrote: TOTAL }
      ],
      { tag: TAG, bytes: 300 }
    )
    await run(test)
    expect(test.offsets).toEqual([300, 0])
  })

  it('restarts when the server ignores the Range header', async () => {
    const test = harness(
      [
        { status: 200, wrote: TOTAL },
        { status: 200, wrote: TOTAL }
      ],
      { tag: TAG, bytes: 300 }
    )
    await run(test)
    expect(test.offsets).toEqual([300, 0])
  })

  it('gives up after four tries and reports the last status', async () => {
    const test = harness(Array.from({ length: 4 }, () => ({ status: 503, wrote: 10 })))
    await expect(run(test)).rejects.toThrow('APK download failed (HTTP 503) after 4 tries.')
    expect(test.delays).toEqual([2000, 5000, 12000])
  })

  it('does not retry a client error', async () => {
    const test = harness([{ status: 404, wrote: 30 }])
    await expect(run(test)).rejects.toThrow('APK download failed (HTTP 404) after 1 try.')
    expect(test.offsets).toEqual([0])
  })

  it('skips the network when the cached file is already complete', async () => {
    const test = harness([], { tag: TAG, bytes: TOTAL })
    await run(test)
    expect(test.offsets).toEqual([])
  })

  it('discards a cached file larger than the release asset', async () => {
    const test = harness([{ status: 200, wrote: TOTAL }], { tag: TAG, bytes: TOTAL + 1 })
    await run(test)
    expect(test.offsets).toEqual([0])
  })
})
