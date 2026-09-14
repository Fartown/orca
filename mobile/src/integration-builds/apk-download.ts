const RETRY_DELAYS_MS = [2_000, 5_000, 12_000]
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504])

export interface ApkDownloadPorts {
  /** Bytes of the cached partial APK, 0 when nothing is cached. */
  partialBytes(): Promise<number>
  /** Release tag the cached partial belongs to, null when unknown. */
  cachedTag(): Promise<string | null>
  /** Drop the cached partial and its tag marker. */
  discard(): Promise<void>
  /** Record which release the cached partial belongs to. */
  claim(tag: string): Promise<void>
  /** Run one request starting at `offset`; resolves the HTTP status, null when cancelled. */
  attempt(offset: number): Promise<number | null>
  delay(ms: number): Promise<void>
}

export interface ApkDownloadRequest {
  tag: string
  expectedBytes: number
}

interface AttemptOutcome {
  done: boolean
  retryable: boolean
  keepPartial: boolean
  failure: string
}

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error))

async function runAttempt(offset: number, ports: ApkDownloadPorts): Promise<AttemptOutcome> {
  let status: number | null
  try {
    status = await ports.attempt(offset)
  } catch (error) {
    // Whatever reached the file before the socket broke is real payload, so resume from it.
    return {
      done: false,
      retryable: true,
      keepPartial: true,
      failure: `APK download failed: ${describe(error)}`
    }
  }
  if (status === null) {
    return { done: false, retryable: true, keepPartial: true, failure: 'APK download stalled' }
  }
  if (status === 206 || (status === 200 && offset === 0)) {
    return { done: true, retryable: false, keepPartial: true, failure: '' }
  }
  // Android writes every response body to the file regardless of status, so an error page — or a
  // 200 from a server that ignored our Range header — has already poisoned the partial.
  return {
    done: false,
    retryable: RETRYABLE_STATUSES.has(status) || status === 200 || status === 416,
    keepPartial: false,
    failure: `APK download failed (HTTP ${status})`
  }
}

async function openPartial(request: ApkDownloadRequest, ports: ApkDownloadPorts): Promise<number> {
  if ((await ports.cachedTag()) !== request.tag) {
    await ports.discard()
  }
  await ports.claim(request.tag)
  const bytes = await ports.partialBytes()
  if (request.expectedBytes > 0 && bytes > request.expectedBytes) {
    await ports.discard()
    await ports.claim(request.tag)
    return 0
  }
  return bytes
}

/**
 * Download the integration APK, resuming a cached partial across retries and app restarts. The
 * digest check that follows is what decides the bytes are usable; this only gets them on disk.
 */
export async function downloadResumableApk(
  request: ApkDownloadRequest,
  ports: ApkDownloadPorts
): Promise<void> {
  let offset = await openPartial(request, ports)
  if (request.expectedBytes > 0 && offset === request.expectedBytes) {
    return
  }
  let failure = 'APK download failed'
  let attempts = 0
  while (attempts <= RETRY_DELAYS_MS.length) {
    if (attempts > 0) {
      await ports.delay(RETRY_DELAYS_MS[attempts - 1])
    }
    attempts += 1
    const outcome = await runAttempt(offset, ports)
    if (outcome.done) {
      return
    }
    failure = outcome.failure
    if (!outcome.retryable) {
      break
    }
    if (outcome.keepPartial) {
      offset = await ports.partialBytes()
    } else {
      await ports.discard()
      await ports.claim(request.tag)
      offset = 0
    }
  }
  throw new Error(`${failure} after ${attempts} ${attempts === 1 ? 'try' : 'tries'}.`)
}
