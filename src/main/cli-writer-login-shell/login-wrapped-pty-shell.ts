import type { ProcessTableIndex } from '../../shared/process-table-index'
import type { ProcessTableRow } from '../../shared/process-table-snapshot'

// The TCC attribution wrapper from src/main/providers/macos-tcc-login-shell.ts; it execs into the shell.
const MACOS_LOGIN_EXECUTABLE = '/usr/bin/login'

function processExecutable(command: string): string {
  return command.trim().replace(/^-/, '').split(/\s+/, 1)[0] ?? ''
}

/** The shell a PTY runs: its root process, or the sole child of the macOS login wrapper it was spawned through. */
export function ptyShellRow(
  index: ProcessTableIndex,
  rootPid: number
): ProcessTableRow | undefined {
  const root = index.byPid.get(rootPid)
  if (!root || processExecutable(root.command) !== MACOS_LOGIN_EXECUTABLE) {
    return root
  }
  const children = index.childrenByPpid.get(rootPid) ?? []
  // A second child under login is not launch plumbing we can vouch for.
  return children.length === 1 ? children[0] : undefined
}
