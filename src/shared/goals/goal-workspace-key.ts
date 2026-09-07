import { createHash } from 'node:crypto'
import { basename, resolve, sep } from 'node:path'

/**
 * The v1 driver keys every goal by workspace, not by terminal (see
 * goal-mode/cli/goal-state.mjs `goalKey`). The host needs the same key to read
 * the driver-owned record and lock, so this is a byte-for-byte port; the parity
 * test pins both implementations to the same outputs.
 */
export function goalWorkspaceKey(
  worktreePath: string,
  platform: NodeJS.Platform = process.platform
): string {
  const raw = String(worktreePath ?? '').trim()
  if (!raw) {
    throw new Error('Workspace path must not be empty')
  }
  let full = resolve(raw).replace(/[/\\]+$/, '') || sep
  if (platform === 'darwin' || platform === 'win32') {
    full = full.toLowerCase()
  }
  const label = (basename(full) || 'root').replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 32)
  const hash = createHash('sha256').update(full).digest('hex').slice(0, 10)
  return `${label === '.' || label === '..' ? 'root' : label}-${hash}`
}
