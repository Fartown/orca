export function encodeArtifactShareRelativePath(relativePath: string): string {
  return relativePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

export function buildArtifactShareUrlBase(input: {
  ip: string
  port: number
  token: string
}): string {
  return `http://${input.ip}:${input.port}/${input.token}/`
}

export function buildArtifactShareUrl(input: {
  ip: string
  port: number
  token: string
  relativePath: string
}): string {
  return `${buildArtifactShareUrlBase(input)}${encodeArtifactShareRelativePath(input.relativePath)}`
}

/** Segments a reader can never use to leave the shared root, whatever the host's separator. */
export function isUnsafeArtifactSharePathSegment(segment: string): boolean {
  return (
    segment === '' ||
    segment === '.' ||
    segment === '..' ||
    segment.includes('\0') ||
    segment.includes('\\') ||
    segment.includes('/')
  )
}
