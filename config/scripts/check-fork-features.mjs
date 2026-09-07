#!/usr/bin/env node
// Fork feature registry gate. Reads config/fork-features.jsonc and fails when a listed
// feature lost an entry file, a seam registration, a test, or its journal, or when the
// architecture policy no longer budgets one of its paths against upstream. Data only:
// register features in the manifest instead of adding branches here.
// See docs/reference/fork-maintenance.md.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { parse, printParseErrorCode } from 'jsonc-parser'
import { loadArchitecturePolicyManifest } from './architecture-policy-manifest.mjs'
import { matchesAnyPathPattern, normalizeRepositoryPath } from './architecture-policy-matching.mjs'

export const FORK_FEATURES_PATH = 'config/fork-features.jsonc'
export const FORK_BUDGET_POLICY_ID = 'fork-upstream-diff-budget'
export const FORK_BUDGET_RULE_ID = 'fork-integration-scope'

function requireStringArray(owner, value, errors) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item)) {
    errors.push(`${owner} must be an array of non-empty strings`)
  }
}

export function validateForkFeatureRegistry(registry) {
  const errors = []
  if (registry?.schemaVersion !== 1) {
    errors.push('schemaVersion must be 1')
  }
  for (const [key, field] of [
    ['upstream', 'remote'],
    ['upstream', 'branch'],
    ['fork', 'remote'],
    ['fork', 'integrationBranch']
  ]) {
    if (typeof registry?.[key]?.[field] !== 'string' || !registry[key][field]) {
      errors.push(`${key}.${field} must be a non-empty string`)
    }
  }
  if (!Array.isArray(registry?.features) || registry.features.length === 0) {
    errors.push('features must be a non-empty array')
    return errors
  }
  const ids = new Set()
  registry.features.forEach((feature, index) => {
    const owner = `features[${index}]`
    if (typeof feature.id !== 'string' || !feature.id) {
      errors.push(`${owner}.id must be a non-empty string`)
    } else if (ids.has(feature.id)) {
      errors.push(`${owner}.id duplicates ${feature.id}`)
    } else {
      ids.add(feature.id)
    }
    for (const field of ['title', 'journal', 'policyId']) {
      if (typeof feature[field] !== 'string' || !feature[field]) {
        errors.push(`${owner}.${field} must be a non-empty string`)
      }
    }
    for (const field of ['ownedPaths', 'requiredFiles', 'tests', 'checks']) {
      requireStringArray(`${owner}.${field}`, feature[field], errors)
    }
    if (!Array.isArray(feature.seams)) {
      errors.push(`${owner}.seams must be an array`)
    } else {
      feature.seams.forEach((seam, seamIndex) => {
        const seamOwner = `${owner}.seams[${seamIndex}]`
        if (typeof seam?.file !== 'string' || !seam.file) {
          errors.push(`${seamOwner}.file must be a non-empty string`)
        }
        if (typeof seam?.mustContain !== 'string' || !seam.mustContain) {
          errors.push(`${seamOwner}.mustContain must be a non-empty string`)
        }
      })
    }
  })
  return errors
}

export function loadForkFeatureRegistry(root, configPath = FORK_FEATURES_PATH) {
  const source = fs.readFileSync(path.resolve(root, configPath), 'utf8')
  const parseErrors = []
  const registry = parse(source, parseErrors, { allowTrailingComma: true })
  if (parseErrors.length > 0) {
    const details = parseErrors
      .map((error) => `${printParseErrorCode(error.error)} at offset ${error.offset}`)
      .join(', ')
    throw new Error(`Invalid JSONC in ${configPath}: ${details}`)
  }
  const errors = validateForkFeatureRegistry(registry)
  if (errors.length > 0) {
    throw new Error(`Invalid fork feature registry ${configPath}:\n- ${errors.join('\n- ')}`)
  }
  return registry
}

/** Tracked plus untracked-but-not-ignored files, so a freshly added entry counts before it is staged. */
export function listRepositoryFiles(root) {
  const result = spawnSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  )
  if (result.status !== 0) {
    throw new Error(`git ls-files failed: ${result.stderr || result.stdout}`)
  }
  return result.stdout.split('\0').filter(Boolean).map(normalizeRepositoryPath)
}

export function findForkBudgetRule(policyManifest) {
  const policy = policyManifest.policies.find((item) => item.id === FORK_BUDGET_POLICY_ID)
  return policy?.rules.find((rule) => rule.id === FORK_BUDGET_RULE_ID) ?? null
}

/**
 * Pure evaluation: no git, no process exit. `files` is the repository file list and
 * `readFile` resolves seam contents, so tests can run against an in-memory tree.
 */
export function evaluateForkFeatures({ registry, policyManifest, files, readFile }) {
  const fileSet = new Set(files)
  const reported = new Set()
  const violations = []
  const report = (featureId, file, message) => {
    const key = `${featureId}\0${file}\0${message}`
    if (reported.has(key)) {
      return
    }
    reported.add(key)
    violations.push({ featureId, file, message })
  }
  const policyIds = new Set(policyManifest.policies.map((policy) => policy.id))
  const budgetRule = findForkBudgetRule(policyManifest)
  if (!budgetRule) {
    report(
      null,
      'config/architecture-policies.jsonc',
      `Policy ${FORK_BUDGET_POLICY_ID} with rule ${FORK_BUDGET_RULE_ID} is missing; the fork has no upstream diff budget.`
    )
  }
  const budgeted = (file) => !budgetRule || matchesAnyPathPattern(file, budgetRule.allowedPaths)

  for (const feature of registry.features) {
    if (!policyIds.has(feature.policyId)) {
      report(
        feature.id,
        FORK_FEATURES_PATH,
        `Feature ${feature.id} references unknown policy ${feature.policyId}.`
      )
    }
    if (!fileSet.has(feature.journal)) {
      report(feature.id, feature.journal, `Feature ${feature.id} lost its journal.`)
    }
    for (const file of feature.requiredFiles) {
      if (!fileSet.has(file)) {
        report(feature.id, file, `Feature ${feature.id} lost a required file.`)
      } else if (!budgeted(file)) {
        report(
          feature.id,
          file,
          `Feature ${feature.id} file is outside the ${FORK_BUDGET_RULE_ID} allowlist.`
        )
      }
    }
    for (const pattern of feature.ownedPaths) {
      const owned = files.filter((file) => matchesAnyPathPattern(file, [pattern]))
      if (owned.length === 0) {
        report(
          feature.id,
          FORK_FEATURES_PATH,
          `Feature ${feature.id} owns ${pattern}, but no file matches it.`
        )
      }
      for (const file of owned) {
        if (!budgeted(file)) {
          report(
            feature.id,
            file,
            `Feature ${feature.id} file is outside the ${FORK_BUDGET_RULE_ID} allowlist.`
          )
        }
      }
    }
    for (const seam of feature.seams) {
      if (!fileSet.has(seam.file)) {
        report(feature.id, seam.file, `Feature ${feature.id} seam file is missing.`)
        continue
      }
      if (!readFile(seam.file).includes(seam.mustContain)) {
        report(
          feature.id,
          seam.file,
          `Feature ${feature.id} seam lost "${seam.mustContain}"${seam.why ? ` (${seam.why})` : ''}.`
        )
      }
      if (!budgeted(seam.file)) {
        report(
          feature.id,
          seam.file,
          `Feature ${feature.id} seam is outside the ${FORK_BUDGET_RULE_ID} allowlist.`
        )
      }
    }
    for (const file of feature.tests) {
      if (!fileSet.has(file)) {
        report(feature.id, file, `Feature ${feature.id} lost a test.`)
      }
    }
  }
  return violations
}

function escapeAnnotation(value) {
  return String(value).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
}

function printRegistry(registry) {
  for (const feature of registry.features) {
    console.log(`${feature.id}  ${feature.title}`)
    console.log(`  journal   ${feature.journal}`)
    console.log(`  policy    ${feature.policyId}`)
    console.log(
      `  owns      ${feature.ownedPaths.length} globs, ${feature.requiredFiles.length} entry files, ${feature.seams.length} seams, ${feature.tests.length} tests`
    )
  }
}

export function main(argv = process.argv.slice(2)) {
  const root = path.resolve(import.meta.dirname, '..', '..')
  const registry = loadForkFeatureRegistry(root)
  if (argv.includes('--list')) {
    printRegistry(registry)
    return 0
  }
  const policyManifest = loadArchitecturePolicyManifest(root)
  const violations = evaluateForkFeatures({
    registry,
    policyManifest,
    files: listRepositoryFiles(root),
    readFile: (file) => fs.readFileSync(path.join(root, file), 'utf8')
  })
  if (violations.length === 0) {
    console.log(
      `Fork feature gate passed: ${registry.features.map((feature) => feature.id).join(', ')}.`
    )
    return 0
  }
  for (const violation of violations) {
    const label = violation.featureId ? `[${violation.featureId}] ` : ''
    console.error(`${violation.file}: ${label}${violation.message}`)
    if (process.env.GITHUB_ACTIONS === 'true') {
      console.error(`::error file=${violation.file}::${escapeAnnotation(violation.message)}`)
    }
  }
  console.error(`Fork feature gate failed with ${violations.length} violation(s).`)
  return 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  process.exitCode = main()
}
