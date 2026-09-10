import { createRequire } from 'node:module'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const config = require('../../../config/electron-builder.config.cjs')
const { FileMatcher } = require('app-builder-lib/out/fileMatcher')

describe('session validation package boundary', () => {
  it('keeps local validation evidence out of the distributable', () => {
    const matcher = new FileMatcher('/app', '/dest', (value: string) => value, config.files)
    matcher.prependPattern('**/*')
    const included = matcher.createFilter()
    expect(
      included(join('/app', '.docs/packaged-owner-ui-validation/evidence/real-hooks.jsonl'), {
        isDirectory: () => false
      })
    ).toBe(false)
    expect(included(join('/app', 'out/main/index.js'), { isDirectory: () => false })).toBe(true)
  })
})
