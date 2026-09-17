import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'

// Why: the relay runs under plain Node 18 on SSH hosts. One stray import of a main-process module
// once pulled Electron into the relay bundle and the relay died before its READY sentinel.
describe('artifact share relay bundle', () => {
  it('loads without Electron or main-process IPC modules on a Node 18 host', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'artifact-share-relay-bundle-'))
    try {
      const outfile = join(outDir, 'relay-service.js')
      const result = await build({
        entryPoints: [join(__dirname, 'artifact-share-relay-service.ts')],
        bundle: true,
        platform: 'node',
        target: 'node18',
        format: 'cjs',
        outfile,
        external: ['electron'],
        metafile: true,
        logLevel: 'silent'
      })
      const inputs = Object.keys(result.metafile.inputs)
      const electronImporters = inputs.filter((input) =>
        result.metafile.inputs[input]?.imports.some((entry) => entry.path === 'electron')
      )

      expect(electronImporters).toEqual([])
      expect(inputs.filter((input) => input.startsWith('src/main/ipc/'))).toEqual([])
      expect(readFileSync(outfile, 'utf8')).not.toContain('.toReversed(')
    } finally {
      rmSync(outDir, { recursive: true, force: true })
    }
  })
})
