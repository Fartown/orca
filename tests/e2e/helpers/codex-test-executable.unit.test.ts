import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveCodexTestExecutable } from './codex-test-executable'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('resolveCodexTestExecutable', () => {
  it('keeps an ordinary executable command unchanged', () => {
    const directory = temporaryDirectory()
    const executable = path.join(directory, 'codex')
    writeFileSync(executable, Buffer.from([0xcf, 0xfa, 0xed, 0xfe]))
    chmodSync(executable, 0o755)

    expect(resolveCodexTestExecutable(executable)).toBe(executable)
  })

  it('strictly resolves the sole real path declared by a shell wrapper', () => {
    const directory = temporaryDirectory()
    const targetDirectory = path.join(directory, 'target')
    mkdirSync(targetDirectory)
    const target = path.join(targetDirectory, 'codex-real')
    const targetLink = path.join(directory, 'codex-current')
    const wrapper = path.join(directory, 'codex')
    writeFileSync(target, '#!/bin/sh\nexit 0\n')
    chmodSync(target, 0o755)
    symlinkSync(target, targetLink)
    writeFileSync(wrapper, `#!/bin/sh\nreal='${targetLink}'\nexec "$real" "$@"\n`)
    chmodSync(wrapper, 0o755)

    expect(resolveCodexTestExecutable(wrapper)).toBe(realpathSync(target))
  })

  it.each([
    ['missing declaration', '#!/bin/sh\nexec /bin/false "$@"\n'],
    [
      'duplicate declaration',
      '#!/bin/sh\nreal=\'/bin/false\'\nreal=\'/bin/true\'\nexec "$real" "$@"\n'
    ],
    ['relative declaration', '#!/bin/sh\nreal=\'relative/codex\'\nexec "$real" "$@"\n'],
    ['non-full-line declaration', '#!/bin/sh\n real=\'/bin/false\'\nexec "$real" "$@"\n']
  ])('rejects a shell wrapper with a %s', (_name, contents) => {
    const directory = temporaryDirectory()
    const wrapper = path.join(directory, 'codex')
    writeFileSync(wrapper, contents)
    chmodSync(wrapper, 0o755)

    expect(() => resolveCodexTestExecutable(wrapper)).toThrow()
  })

  it('rejects a declared target without execute permission', () => {
    const directory = temporaryDirectory()
    const target = path.join(directory, 'codex-real')
    const wrapper = path.join(directory, 'codex')
    writeFileSync(target, '#!/bin/sh\nexit 0\n')
    chmodSync(target, 0o644)
    writeFileSync(wrapper, `#!/bin/sh\nreal='${target}'\nexec "$real" "$@"\n`)
    chmodSync(wrapper, 0o755)

    expect(() => resolveCodexTestExecutable(wrapper)).toThrow()
  })
})

function temporaryDirectory(): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'orca-codex-test-executable-'))
  temporaryDirectories.push(directory)
  return directory
}
