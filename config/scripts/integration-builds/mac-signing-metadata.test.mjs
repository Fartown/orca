import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import {
  findObjectResources,
  exactSigningExclusions,
  assertSigningMetadata
} from './mac-signing-metadata.cjs'

describe('macOS signed resource metadata', () => {
  it('only skips signing thin MH_OBJECT .o resources, never runnable code', () => {
    const root = mkdtempSync(join(tmpdir(), 'orca-object-resource-'))
    const resource = (name, type, endian = 'LE') => {
      const header = Buffer.alloc(16)
      header[`writeUInt32${endian}`](0xfeedfacf, 0)
      header[`writeUInt32${endian}`](type, 12)
      const file = join(root, 'Contents', 'Resources', name)
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, header)
      return file
    }
    try {
      const object = resource('node_modules/node-pty/build/obj.target/pty.o', 1)
      resource('big-endian.o', 1, 'BE')
      resource('runtime-renamed.o', 2)
      resource('module.node', 1)
      resource('library.o', 6)
      resource('Nested.app/Contents/Resources/not-our-scope.o', 1)
      writeFileSync(join(root, 'Contents', 'Resources', 'truncated.o'), 'short')
      symlinkSync(object, join(root, 'Contents', 'Resources', 'symlink.o'))
      expect(findObjectResources(root)).toEqual([
        'Contents/Resources/big-endian.o',
        'Contents/Resources/node_modules/node-pty/build/obj.target/pty.o'
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
  it('escapes glob metacharacters so each exclusion selects only its exact file', () => {
    expect(exactSigningExclusions(['Contents/Resources/obj[a]*?.o'])).toEqual([
      '--exclude',
      'Contents/Resources/obj[[]a[]][*][?].o'
    ])
    expect(exactSigningExclusions([])).toEqual([])
  })
  it('still rejects any change to preserved signing metadata', () => {
    expect(() => assertSigningMetadata([{ flags: 1 }], [{ flags: 0 }])).toThrow()
    expect(() => assertSigningMetadata([{ infoSha256: 'a' }], [{ infoSha256: 'b' }])).toThrow()
    expect(() =>
      assertSigningMetadata([{ entitlements: { jit: true } }], [{ entitlements: {} }])
    ).toThrow()
  })
})
