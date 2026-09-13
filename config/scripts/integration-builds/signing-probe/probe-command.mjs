import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

export function command(executable, args, { allowFailure = false, timeout = 120_000 } = {}) {
  const result = spawnSync(executable, args, {
    encoding: 'utf8',
    timeout,
    maxBuffer: 8 * 1024 * 1024
  })
  const outcome = {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? ''
  }
  if ((result.status !== 0 || result.error) && !allowFailure) {
    // Arguments may contain the disposable keychain password; never include them.
    throw new Error(
      `${executable} failed (${result.status ?? result.signal}): ${outcome.stderr || result.error?.message}`
    )
  }
  return outcome
}

export function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}
