import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ArtifactShareRequestLog } from './artifact-share-http-handler'

const MAX_LOG_BYTES = 1024 * 1024
const KEPT_ROTATIONS = 2

function rotateIfNeeded(path: string): void {
  if (!existsSync(path) || statSync(path).size < MAX_LOG_BYTES) {
    return
  }
  for (let index = KEPT_ROTATIONS; index >= 1; index -= 1) {
    const from = index === 1 ? path : `${path}.${index - 1}`
    if (existsSync(from)) {
      renameSync(from, `${path}.${index}`)
    }
  }
}

/** Writes one line per request; paths and tokens are never logged because the log can outlive a share. */
export function createArtifactShareServeLog(path: string): {
  request: ArtifactShareRequestLog
  event: (message: string) => void
} {
  const write = (line: string): void => {
    try {
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
      rotateIfNeeded(path)
      appendFileSync(path, `${new Date().toISOString()} ${line}\n`, { mode: 0o600 })
    } catch {
      // Logging must never take the share server down.
    }
  }
  return {
    request: (entry) => write(`${entry.category} ${entry.status} ${entry.durationMs}ms`),
    event: (message) => write(message)
  }
}
