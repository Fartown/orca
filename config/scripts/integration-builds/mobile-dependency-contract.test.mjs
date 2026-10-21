import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { lockedVersion, lockfileRootImporter } from '../pnpm-lockfile-root-importer.mjs'

describe('integration update native bundle dependencies', () => {
  it('declares and locks Zustand in the mobile project, independently of the root install', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../../../mobile/package.json', import.meta.url), 'utf8')
    )
    const importer = lockfileRootImporter(
      readFileSync(new URL('../../../mobile/pnpm-lock.yaml', import.meta.url), 'utf8')
    )
    expect(manifest.dependencies.zustand).toBeTypeOf('string')
    expect(importer.dependencies.zustand.specifier).toBe(manifest.dependencies.zustand)
    expect(lockedVersion(importer.dependencies.zustand)).toBeTruthy()
  })
})
