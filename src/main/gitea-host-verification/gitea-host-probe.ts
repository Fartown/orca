import { runCoalescedProbe, type CoalescedProbes } from '../git/coalesced-probe'
import { NEGATIVE_ENTRY_TTL_MS } from '../git/remote-ref-probe-cache'
import type { GiteaRepoRef } from '../gitea/repository-ref'
import { cancelUnreadResponseBody } from '../lib/unread-response-body'

/**
 * Gitea is the fallback for every host no other forge claims, so a self-hosted
 * forge that is not Gitea used to be sent Gitea API calls that could never work.
 * Only a host that answers "not Gitea" loses the fallback; a host that cannot be
 * asked keeps today's behavior.
 */
export type GiteaHostVerdict =
  /** Serves the Gitea version endpoint, or demands credentials for it as sign-in-only Gitea does. */
  | 'gitea'
  /** Answered, and the answer is not Gitea's. */
  | 'not-gitea'
  /** Unreachable, timed out, or a gateway/throttle answer that says nothing about the forge. */
  | 'unverifiable'

const PROBE_TIMEOUT_MS = 4000
const VERDICT_CACHE_MAX_ENTRIES = 256
const CREDENTIAL_REQUIRED_STATUSES = new Set([401, 403])
const UNVERIFIABLE_STATUSES = new Set([408, 429, 502, 503, 504])

type CachedVerdict = { verdict: Exclude<GiteaHostVerdict, 'unverifiable'>; expiresAt: number }

const verdictCache = new Map<string, CachedVerdict>()
const inFlightProbes: CoalescedProbes<GiteaHostVerdict> = new Map()

/** @internal - exposed for tests only */
export function _resetGiteaHostProbeCache(): void {
  verdictCache.clear()
  inFlightProbes.clear()
}

function hasVersionField(body: unknown): boolean {
  return (
    typeof body === 'object' &&
    body !== null &&
    'version' in body &&
    typeof body.version === 'string'
  )
}

async function readVersionVerdict(response: Response): Promise<GiteaHostVerdict> {
  if (UNVERIFIABLE_STATUSES.has(response.status)) {
    await cancelUnreadResponseBody(response)
    return 'unverifiable'
  }
  if (CREDENTIAL_REQUIRED_STATUSES.has(response.status)) {
    await cancelUnreadResponseBody(response)
    return 'gitea'
  }
  if (!response.ok) {
    await cancelUnreadResponseBody(response)
    return 'not-gitea'
  }
  let text: string
  try {
    text = await response.text()
  } catch {
    return 'unverifiable'
  }
  try {
    return hasVersionField(JSON.parse(text)) ? 'gitea' : 'not-gitea'
  } catch {
    return 'not-gitea'
  }
}

async function requestVersionVerdict(apiBaseUrl: string): Promise<GiteaHostVerdict> {
  try {
    // No credentials: the configured Gitea token must never reach a host not yet known to be Gitea.
    const response = await fetch(`${apiBaseUrl.replace(/\/+$/, '')}/version`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)
    })
    return await readVersionVerdict(response)
  } catch {
    return 'unverifiable'
  }
}

function rememberVerdict(apiBaseUrl: string, verdict: GiteaHostVerdict): void {
  if (verdict === 'unverifiable') {
    return
  }
  verdictCache.delete(apiBaseUrl)
  verdictCache.set(apiBaseUrl, {
    verdict,
    // A host that stopped being Gitea is rare; one that became reachable as Gitea must not wait for a restart.
    expiresAt: verdict === 'gitea' ? Number.POSITIVE_INFINITY : Date.now() + NEGATIVE_ENTRY_TTL_MS
  })
  while (verdictCache.size > VERDICT_CACHE_MAX_ENTRIES) {
    const oldest = verdictCache.keys().next().value
    if (oldest === undefined) {
      return
    }
    verdictCache.delete(oldest)
  }
}

export async function probeGiteaHost(apiBaseUrl: string): Promise<GiteaHostVerdict> {
  const cached = verdictCache.get(apiBaseUrl)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.verdict
  }
  return runCoalescedProbe(inFlightProbes, apiBaseUrl, async (ownsKey) => {
    const verdict = await requestVersionVerdict(apiBaseUrl)
    if (ownsKey()) {
      rememberVerdict(apiBaseUrl, verdict)
    }
    return verdict
  })
}

/** Keeps a parsed Gitea ref unless its host answered as something else; an explicit API base skips the probe. */
export async function confirmGiteaRepoRef(
  repo: GiteaRepoRef | null,
  options: { apiBaseConfigured: boolean }
): Promise<GiteaRepoRef | null> {
  if (!repo || options.apiBaseConfigured) {
    return repo
  }
  return (await probeGiteaHost(repo.apiBaseUrl)) === 'not-gitea' ? null : repo
}
