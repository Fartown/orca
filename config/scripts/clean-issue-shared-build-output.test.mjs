import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanIssueSharedBuildOutput } from './clean-issue-shared-build-output.mjs'

const scratchDirectories = []

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('Issue shared build output cleanup', () => {
  it('removes stale compiled modules before TypeScript emits the current contract', () => {
    const directory = mkdtempSync(join(tmpdir(), 'orca-issue-output-'))
    scratchDirectories.push(directory)
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'digest-schemas.js'), 'stale')

    cleanIssueSharedBuildOutput(directory)

    expect(() => readFileSync(join(directory, 'digest-schemas.js'))).toThrow()
  })
})
