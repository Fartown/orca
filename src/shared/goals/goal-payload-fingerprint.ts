import { sha256 } from '../hashing/sha256'

// Why pure-JS sha256: the LAN web client can run in a non-secure context where crypto.subtle is undefined.
export function fingerprintPayload(payload: unknown): string {
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
