import { execFileSync } from 'node:child_process'

// Release listings carry every body and asset; upstream's run past execFileSync's 1 MB default.
const MAX_OUTPUT_BYTES = 256 * 1024 * 1024

/** Runs `command` with the given arguments and returns its standard output. */
export function commandOutput(command) {
  return (args) =>
    execFileSync(command, args, {
      encoding: 'utf8',
      maxBuffer: MAX_OUTPUT_BYTES,
      stdio: ['ignore', 'pipe', 'pipe']
    })
}
