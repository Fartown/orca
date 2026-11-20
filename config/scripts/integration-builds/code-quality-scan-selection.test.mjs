import { describe, expect, it } from 'vitest'
import { OXLINT_SCANS } from '../preflight/changed-checks/check-changed-code-quality.mjs'
import {
  oxlintScanId,
  runsAstGrepScan,
  runsCastingSafetyCheck,
  selectOxlintScans
} from './code-quality-scan-selection.mjs'

describe('scan selection', () => {
  it('runs every scan when nothing is selected', () => {
    expect(selectOxlintScans(OXLINT_SCANS, undefined)).toEqual(OXLINT_SCANS)
    expect(selectOxlintScans(OXLINT_SCANS, '')).toEqual(OXLINT_SCANS)
  })

  it('keeps the declared order rather than the order asked for', () => {
    // Why: the summary lines read as a fixed sequence in CI logs, so a caller cannot reorder them.
    expect(selectOxlintScans(OXLINT_SCANS, 'react-doctor,quality').map(oxlintScanId)).toEqual([
      'quality',
      'react-doctor'
    ])
  })

  it('selects one scan and tolerates whitespace', () => {
    expect(selectOxlintScans(OXLINT_SCANS, ' casting ').map(oxlintScanId)).toEqual(['casting'])
  })

  it('refuses an unknown id instead of silently linting nothing', () => {
    // Why loud: a typo that quietly selected zero scans would report a passing gate.
    expect(() => selectOxlintScans(OXLINT_SCANS, 'castign')).toThrow(/Unknown code-quality scan id/)
  })

  it('gives every upstream scan a stable id', () => {
    // Why: upstream renaming or adding a scan must not silently drop it from selections.
    const ids = OXLINT_SCANS.map(oxlintScanId)
    expect(ids.filter(Boolean)).toHaveLength(OXLINT_SCANS.length)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('runs ast-grep only unselected and casting SAFETY only with the casting scan', () => {
    expect(runsAstGrepScan(undefined)).toBe(true)
    expect(runsAstGrepScan('quality')).toBe(false)
    expect(runsCastingSafetyCheck(undefined)).toBe(true)
    expect(runsCastingSafetyCheck('quality, casting')).toBe(true)
    expect(runsCastingSafetyCheck('quality,type-aware')).toBe(false)
  })
})
