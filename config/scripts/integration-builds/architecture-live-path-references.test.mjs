import { expect, it } from 'vitest'
import { extractPathLiterals } from '../check-path-literal-ratchet.mjs'
import { architectureLivePathReferences } from './architecture-live-path-references.mjs'

it('retains positive and unknown references without requiring forbidden files to exist', () => {
  const manifest = {
    policies: [
      {
        rules: [
          { type: 'forbidden-path', paths: ['src/main/must-stay-deleted.ts'] },
          { type: 'reference-parity', paths: ['src/main/historical-pin.ts'] },
          { type: 'change-scope', allowedPaths: ['src/main/live.ts'] },
          { type: 'future-rule', paths: ['src/main/still-checked.ts'] }
        ]
      }
    ]
  }
  const text = JSON.stringify(manifest)
  expect(
    extractPathLiterals('config/architecture-policies.jsonc', architectureLivePathReferences(text))
  ).toEqual([
    { literal: 'src/main/live.ts', isImport: false },
    { literal: 'src/main/still-checked.ts', isImport: false }
  ])
  expect(JSON.parse(text)).toEqual(manifest)
})
