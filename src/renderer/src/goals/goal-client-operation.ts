import { sha256 } from '../../../shared/sha256'
import { createBrowserUuid } from '@/lib/browser-uuid'

/**
 * Every mutation carries a client-minted id plus a sha256 fingerprint of its
 * payload, mirroring MutationEnvelope: a retry with the same id replays the
 * receipt, a different payload under the same id is refused.
 */
export function newClientOperationId(): string {
  return createBrowserUuid()
}

// Why pure-JS sha256: the LAN web client can run in a non-secure context where crypto.subtle is undefined.
export async function fingerprintPayload(payload: unknown): Promise<string> {
  const digest = sha256(new TextEncoder().encode(canonicalJson(payload)))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Stable key order so the same logical payload always hashes the same. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])])
    )
  }
  return value
}
