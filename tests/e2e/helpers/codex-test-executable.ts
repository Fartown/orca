import {
  accessSync,
  closeSync,
  constants as fsConstants,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync
} from 'node:fs'
import path from 'node:path'

const SHELL_SHEBANG =
  /^#!\s*(?:(?:\/usr\/bin\/env)(?:\s+-S)?\s+|(?:\/[^\s/]+)*\/)(?:ba|da|k|z)?sh(?:\s|$)/

export function resolveCodexTestExecutable(commandPath: string): string {
  assertExecutable(commandPath, 'Codex command')
  if (!isShellScript(commandPath)) {
    return commandPath
  }

  const matches = [...readFileSync(commandPath, 'utf8').matchAll(/^real='([^'\r\n]+)'\r?$/gm)]
  if (matches.length !== 1) {
    throw new Error(
      `Codex shell wrapper must contain exactly one full real='absolute path' line; found ${matches.length}`
    )
  }
  const declaredPath = matches[0]?.[1]
  if (!declaredPath || !path.isAbsolute(declaredPath)) {
    throw new Error('Codex shell wrapper real path must be absolute')
  }
  assertExecutable(declaredPath, 'Codex shell wrapper real path')
  const executablePath = realpathSync(declaredPath)
  assertExecutable(executablePath, 'Resolved Codex executable')
  return executablePath
}

function assertExecutable(filePath: string, label: string): void {
  if (!existsSync(filePath)) {
    throw new Error(`${label} does not exist`)
  }
  accessSync(filePath, fsConstants.X_OK)
}

function isShellScript(filePath: string): boolean {
  const descriptor = openSync(filePath, 'r')
  try {
    const buffer = Buffer.alloc(256)
    const bytesRead = readSync(descriptor, buffer, 0, buffer.length, 0)
    const firstLine = buffer.subarray(0, bytesRead).toString('utf8').split(/\r?\n/, 1)[0] ?? ''
    return SHELL_SHEBANG.test(firstLine)
  } finally {
    closeSync(descriptor)
  }
}
