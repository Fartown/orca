import { chmodSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export function ensureIssueDatabaseDirectory(databasePath: string): void {
  const directory = dirname(databasePath)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  if (process.platform !== 'win32') {
    chmodSync(directory, 0o700)
  }
}

export function hardenIssueDatabaseFiles(databasePath: string): void {
  if (process.platform === 'win32') {
    return
  }
  for (const path of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
    try {
      if (existsSync(path)) {
        chmodSync(path, 0o600)
      }
    } catch {
      // Network mounts can reject chmod without weakening the owning profile's access boundary.
    }
  }
}
