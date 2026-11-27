import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveBaselineReleaseRef } from '../../../tests/e2e/cross-version-wire/release-checkouts/release-checkout'
import { publishReleaseCheckout } from '../../../tests/e2e/cross-version-wire/release-checkouts/release-checkout-publication.ts'

const temporaryRoots: string[] = []

const SHIPPED_TERMINAL_PROTOCOL = 'src/shared/terminal-stream-protocol.ts'
const MOVED_TERMINAL_PROTOCOL = 'src/shared/terminal/stream/terminal-stream-protocol.ts'

async function publishTerminalProtocolFixture(paths: readonly string[]): Promise<string> {
  const cacheRoot = mkdtempSync(join(tmpdir(), 'orca-cross-version-checkout-'))
  temporaryRoots.push(cacheRoot)
  const root = join(cacheRoot, 'release')
  await publishReleaseCheckout({
    root,
    ref: 'v1.4.256',
    commit: 'f'.repeat(40),
    populateStaging: async (staging) => {
      for (const relativePath of paths) {
        const file = join(staging, relativePath)
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, 'export const synthetic = true\n')
      }
    }
  })
  return root
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

it('keeps an explicit newer baseline ref independent of the default candidate pool', () => {
  vi.stubEnv('ORCA_CROSS_VERSION_BASELINE_REF', 'v1.4.256')
  try {
    expect(resolveBaselineReleaseRef()).toBe('v1.4.256')
  } finally {
    vi.unstubAllEnvs()
  }
})

describe('release checkout terminal protocol location', () => {
  it.each([SHIPPED_TERMINAL_PROTOCOL, MOVED_TERMINAL_PROTOCOL])(
    'publishes a historical release with terminal protocol at %s',
    async (relativePath) => {
      const root = await publishTerminalProtocolFixture([relativePath])
      expect(existsSync(join(root, relativePath))).toBe(true)
      expect(existsSync(join(root, 'checkout-stamp.json'))).toBe(true)
    }
  )

  const rejectedProtocolLocations: { kind: string; paths: string[] }[] = [
    { kind: 'missing', paths: [] },
    {
      kind: 'ambiguous',
      paths: [SHIPPED_TERMINAL_PROTOCOL, 'src/shared/older/terminal-stream-protocol.ts']
    }
  ]
  it.each(rejectedProtocolLocations)('refuses a $kind terminal protocol', async ({ paths }) => {
    await expect(publishTerminalProtocolFixture(paths)).rejects.toThrow(
      /missing the terminal stream protocol/
    )
  })
})
