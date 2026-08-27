import { app } from 'electron'

const PRODUCTION_ARTIFACTS_API_URL = 'https://share.onorca.dev'

const LOOPBACK_HOSTNAMES = ['127.0.0.1', 'localhost', '[::1]']

function isPackaged(): boolean {
  try {
    return app?.isPackaged === true
  } catch {
    return false
  }
}

/** Parsed rather than prefix-matched: `10.0.0.1.evil.com` starts with a private range. */
function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.')
  if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/.test(part))) {
    return false
  }
  const [a, b] = parts.map(Number)
  if (parts.some((part) => Number(part) > 255)) {
    return false
  }
  return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)
}

/** Hosts that cannot be reached from outside the local link, so a self-hosted backend may live there. */
function isPrivateHost(hostname: string): boolean {
  return (
    LOOPBACK_HOSTNAMES.includes(hostname) ||
    isPrivateIpv4(hostname) ||
    // `.local` is reserved for mDNS (RFC 6762) and never resolves off-link.
    hostname.endsWith('.local')
  )
}

export function resolveArtifactCloudApiUrl(
  override?: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  const candidate = override?.trim() || env.ORCA_ARTIFACTS_API_URL?.trim()
  const url = new URL(candidate || PRODUCTION_ARTIFACTS_API_URL)
  const privateHost = isPrivateHost(url.hostname)
  const firstParty = url.hostname === 'onorca.dev' || url.hostname.endsWith('.onorca.dev')
  // A self-hosted backend may use plaintext so it needs no certificate. The bearer sent to it is
  // an Orca account credential, so this is limited to hosts that cannot be reached off-link.
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && privateHost)) {
    throw new Error('Artifact API URLs must use HTTPS; only a private LAN backend may use HTTP.')
  }
  if (!firstParty && !privateHost) {
    throw new Error('Artifact API URLs must use an onorca.dev host or a private LAN address.')
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Artifact API URL must be an origin without credentials, paths, or parameters.')
  }
  return url.origin
}

export function allowsArtifactCloudAuthOverride(
  env: NodeJS.ProcessEnv = process.env,
  packaged = isPackaged()
): boolean {
  return env.NODE_ENV !== 'production' && !packaged
}
