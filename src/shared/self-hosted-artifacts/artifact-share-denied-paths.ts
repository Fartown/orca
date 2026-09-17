// Why: a shared token opens the whole workspace, so names that conventionally hold credentials
// stay unreadable even when the reader edits the URL. Matching is case-insensitive because
// macOS and Windows resolve `.ENV` to the same file as `.env`.
const DENIED_DIRECTORY_NAMES = new Set([
  '.git',
  '.hg',
  '.svn',
  '.ssh',
  '.gnupg',
  '.aws',
  '.docker',
  '.kube'
])
const DENIED_FILE_NAMES = new Set(['.env', '.npmrc', '.netrc', '.pypirc'])
const DENIED_FILE_PATTERNS = [
  /^\.env\./,
  /^id_rsa/,
  /^id_ecdsa/,
  /^id_ed25519/,
  /\.pem$/,
  /\.key$/,
  /\.p12$/,
  /\.pfx$/
]

/** True when any segment of a `/`-separated path names a credential-bearing location. */
export function isDeniedArtifactSharePath(relativePath: string): boolean {
  const segments = relativePath.split('/').filter((segment) => segment.length > 0)
  return segments.some((segment, index) => {
    const name = segment.toLowerCase()
    if (DENIED_DIRECTORY_NAMES.has(name)) {
      return true
    }
    if (index < segments.length - 1) {
      return false
    }
    return DENIED_FILE_NAMES.has(name) || DENIED_FILE_PATTERNS.some((pattern) => pattern.test(name))
  })
}
