import process from 'node:process'

// Ids for the upstream changed-code Oxlint scans, keyed by label so upstream's list stays verbatim.
const SCAN_IDS = new Map([
  ['code quality', 'quality'],
  ['JS plugins', 'js-plugins'],
  ['casting code quality', 'casting'],
  ['focused plugins', 'focused-plugins'],
  ['type-aware code quality', 'type-aware'],
  ['React Doctor', 'react-doctor'],
  ['design system', 'design-system']
])

export function oxlintScanId(scan) {
  return SCAN_IDS.get(scan.label)
}

function selectedIds(selection) {
  return selection
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

/**
 * Which scans to run, as a comma-separated list of ids; all of them when unset.
 *
 * Why this exists: a caller may audit a wider range than one pull request — the fork compares its
 * whole delta against merged upstream — so a rule upstream adds later lands retroactively on code
 * written before it. Selecting scans lets that caller keep the wide sweep for the rules it wants
 * while running a newly tightened one over added lines only.
 */
export function selectOxlintScans(scans, selection = process.env.ORCA_CODE_QUALITY_SCANS) {
  if (!selection) {
    return scans
  }
  const wanted = selectedIds(selection)
  const known = scans.map(oxlintScanId).filter(Boolean)
  const unknown = wanted.filter((entry) => !known.includes(entry))
  if (unknown.length > 0) {
    throw new Error(
      `Unknown code-quality scan id(s): ${unknown.join(', ')}. Known ids: ${known.join(', ')}.`
    )
  }
  return scans.filter((scan) => wanted.includes(oxlintScanId(scan)))
}

/**
 * Why only unselected: a selection names Oxlint scans for a wide sweep, and ast-grep, like casting,
 * must not land retroactively on code written before its rules; the PR-base run still covers it.
 */
export function runsAstGrepScan(selection = process.env.ORCA_CODE_QUALITY_SCANS) {
  return !selection
}

/**
 * Why gated: the SAFETY check polices suppressions of the casting rule, so it belongs with that
 * scan and would otherwise print a reassuring zero for a range this run never linted for casts.
 */
export function runsCastingSafetyCheck(selection = process.env.ORCA_CODE_QUALITY_SCANS) {
  return !selection || selectedIds(selection).includes('casting')
}
