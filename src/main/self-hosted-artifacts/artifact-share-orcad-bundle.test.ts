import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'

// Orca Server runs under plain Node on SSH hosts; desktop imports must stay outside its bundle.
describe('artifact share orcad bundle', () => {
  it('loads without Electron or main-process IPC modules on a Node 24 host', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'artifact-share-orcad-bundle-'))
    try {
      const outfile = join(outDir, 'orcad-service.js')
      const result = await build({
        entryPoints: [join(__dirname, 'orcad-artifact-share.ts')],
        bundle: true,
        platform: 'node',
        target: 'node24',
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
