import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import {
  extractModuleSpecifiers,
  matchesAnyPathPattern,
  normalizeRepositoryPath,
  resolveRepositoryImport
} from './architecture-policy-matching.mjs'
import {
  loadArchitecturePolicyManifest,
  validateArchitecturePolicyManifest
} from './architecture-policy-manifest.mjs'

export {
  loadArchitecturePolicyManifest,
  validateArchitecturePolicyManifest
} from './architecture-policy-manifest.mjs'

const DEFAULT_CONFIG_PATH = 'config/architecture-policies.jsonc'

function runGit(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  })
}

function splitNullDelimited(value) {
  return value.split('\0').filter(Boolean).map(normalizeRepositoryPath)
}

function gitCommitExists(root, reference) {
  return (
    spawnSync('git', ['rev-parse', '--verify', `${reference}^{commit}`], {
      cwd: root,
      stdio: 'ignore'
    }).status === 0
  )
}

export function listRepositoryFiles(root) {
  return splitNullDelimited(
    runGit(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
  ).filter((file) => {
    try {
      return fs.lstatSync(path.join(root, file)).isFile()
    } catch {
      return false
    }
  })
}

function currentUntrackedFiles(root) {
  return splitNullDelimited(runGit(root, ['ls-files', '-z', '--others', '--exclude-standard']))
}

function effectiveReference(manifest, override, configured) {
  if (configured && configured !== '$base') {
    return configured
  }
  return override ?? manifest.defaultBaseRef
}

function collectChangedFiles(root, manifest, rule, baseOverride) {
  if (rule.comparison === 'worktree') {
    const tracked = splitNullDelimited(
      runGit(root, ['diff', '--name-only', '--no-renames', '-z', 'HEAD', '--'])
    )
    return { files: [...new Set([...tracked, ...currentUntrackedFiles(root)])].sort() }
  }

  const baseRef = effectiveReference(manifest, baseOverride, rule.baseRef)
  if (!gitCommitExists(root, baseRef)) {
    return { files: [], error: `Git base does not exist: ${baseRef}`, baseRef }
  }
  const ancestor =
    spawnSync('git', ['merge-base', '--is-ancestor', baseRef, 'HEAD'], {
      cwd: root,
      stdio: 'ignore'
    }).status === 0
  const comparisonBase = runGit(root, ['merge-base', baseRef, 'HEAD']).trim()
  const tracked = splitNullDelimited(
    runGit(root, ['diff', '--name-only', '--no-renames', '-z', comparisonBase, '--'])
  )
  return {
    files: [...new Set([...tracked, ...currentUntrackedFiles(root)])].sort(),
    baseRef,
    ancestor
  }
}

function isRuleActive(rule, changedFiles) {
  return (
    !rule.whenChanged || changedFiles.some((file) => matchesAnyPathPattern(file, rule.whenChanged))
  )
}

function violation(policy, rule, code, message, location = {}) {
  return { policyId: policy.id, ruleId: rule.id, code, message, ...location }
}

function auditChangeScope(root, manifest, policy, rule, baseOverride) {
  const state = collectChangedFiles(root, manifest, rule, baseOverride)
  if (state.error) {
    return [violation(policy, rule, 'base-missing', state.error)]
  }
  if (!isRuleActive(rule, state.files)) {
    return []
  }

  const violations = []
  if (rule.comparison === 'base' && rule.requireBaseAncestor && !state.ancestor) {
    violations.push(
      violation(
        policy,
        rule,
        'base-not-ancestor',
        `${state.baseRef} is not an ancestor of HEAD; update the branch before evaluating its scope`
      )
    )
  }
  const exceptPaths = rule.exceptPaths ?? []
  for (const file of state.files) {
    if (matchesAnyPathPattern(file, exceptPaths)) {
      continue
    }
    if (!matchesAnyPathPattern(file, rule.allowedPaths)) {
      violations.push(
        violation(
          policy,
          rule,
          'path-outside-scope',
          rule.message ?? 'Path is outside the declared change scope',
          {
            path: file
          }
        )
      )
    }
  }
  if (rule.maxChangedFiles !== undefined && state.files.length > rule.maxChangedFiles) {
    violations.push(
      violation(
        policy,
        rule,
        'changed-file-budget-exceeded',
        `${state.files.length} changed files exceeds the budget of ${rule.maxChangedFiles}`
      )
    )
  }
  return violations
}

function auditReferenceParity(root, manifest, policy, rule, baseOverride) {
  const reference = effectiveReference(manifest, baseOverride, rule.reference)
  if (!gitCommitExists(root, reference)) {
    return [
      violation(policy, rule, 'reference-missing', `Git reference does not exist: ${reference}`)
    ]
  }
  const changed = new Set([
    ...splitNullDelimited(
      runGit(root, ['diff', '--name-only', '--no-renames', '-z', reference, '--'])
    ),
    ...currentUntrackedFiles(root)
  ])
  return [...changed]
    .filter(
      (file) =>
        matchesAnyPathPattern(file, rule.paths) &&
        !matchesAnyPathPattern(file, rule.exceptPaths ?? [])
    )
    .sort()
    .map((file) =>
      violation(
        policy,
        rule,
        'reference-drift',
        rule.message ?? `Path must remain byte-identical to ${reference}`,
        { path: file }
      )
    )
}

function readSource(root, file, policy, rule, violations) {
  try {
    return fs.readFileSync(path.join(root, file), 'utf8')
  } catch (error) {
    violations.push(
      violation(policy, rule, 'source-read-failed', `Could not read source: ${error.message}`, {
        path: file
      })
    )
    return null
  }
}

function auditDependencyBoundary(root, repositoryFiles, manifest, policy, rule) {
  const violations = []
  const fileSet = new Set(repositoryFiles)
  for (const file of repositoryFiles) {
    if (
      !matchesAnyPathPattern(file, rule.sourceFiles) ||
      matchesAnyPathPattern(file, rule.exceptPaths ?? [])
    ) {
      continue
    }
    const source = readSource(root, file, policy, rule, violations)
    if (source === null) {
      continue
    }
    if (rule.importTextHints && !rule.importTextHints.some((hint) => source.includes(hint))) {
      continue
    }
    for (const entry of extractModuleSpecifiers(source, file)) {
      const target = resolveRepositoryImport(entry.specifier, file, manifest.aliases, fileSet)
      if (target && matchesAnyPathPattern(target, rule.forbiddenTargets)) {
        violations.push(
          violation(
            policy,
            rule,
            'forbidden-dependency',
            rule.message ?? `Import crosses a forbidden dependency boundary: ${target}`,
            { path: file, line: entry.line, detail: target }
          )
        )
      }
    }
  }
  return violations
}

function auditForbiddenPaths(repositoryFiles, policy, rule) {
  return repositoryFiles
    .filter(
      (file) =>
        matchesAnyPathPattern(file, rule.paths) &&
        !matchesAnyPathPattern(file, rule.exceptPaths ?? [])
    )
    .map((file) =>
      violation(policy, rule, 'forbidden-path', rule.message ?? 'Forbidden path exists', {
        path: file
      })
    )
}

function matchLine(source, offset) {
  let line = 1
  for (let index = 0; index < offset; index += 1) {
    if (source.charCodeAt(index) === 10) {
      line += 1
    }
  }
  return line
}

function auditForbiddenContent(root, repositoryFiles, policy, rule) {
  const violations = []
  for (const file of repositoryFiles) {
    if (
      !matchesAnyPathPattern(file, rule.files) ||
      matchesAnyPathPattern(file, rule.exceptPaths ?? [])
    ) {
      continue
    }
    const source = readSource(root, file, policy, rule, violations)
    if (source === null) {
      continue
    }
    for (const pattern of rule.patterns) {
      const flags = pattern.flags?.includes('g') ? pattern.flags : `${pattern.flags ?? ''}g`
      const expression = new RegExp(pattern.regex, flags)
      for (const match of source.matchAll(expression)) {
        violations.push(
          violation(
            policy,
            rule,
            `forbidden-content:${pattern.id}`,
            pattern.message ?? rule.message ?? `Forbidden source pattern matched: ${pattern.id}`,
            { path: file, line: matchLine(source, match.index) }
          )
        )
        if (match[0].length === 0) {
          expression.lastIndex += 1
        }
      }
    }
  }
  return violations
}

function sortViolations(violations) {
  return violations.sort((left, right) =>
    [left.policyId, left.ruleId, left.path ?? '', left.line ?? 0, left.code]
      .join('\0')
      .localeCompare(
        [right.policyId, right.ruleId, right.path ?? '', right.line ?? 0, right.code].join('\0')
      )
  )
}

export function auditArchitecturePolicies({
  root = process.cwd(),
  manifest,
  baseRef,
  policyIds = []
}) {
  const validationErrors = validateArchitecturePolicyManifest(manifest)
  if (validationErrors.length > 0) {
    return validationErrors.map((message) => ({
      policyId: '<manifest>',
      ruleId: '<validation>',
      code: 'invalid-manifest',
      message
    }))
  }

  const selected = new Set(policyIds)
  const knownPolicies = new Set(manifest.policies.map((policy) => policy.id))
  const unknownPolicies = [...selected].filter((id) => !knownPolicies.has(id))
  if (unknownPolicies.length > 0) {
    return unknownPolicies.map((id) => ({
      policyId: id,
      ruleId: '<selection>',
      code: 'unknown-policy',
      message: `Unknown architecture policy: ${id}`
    }))
  }

  const repositoryFiles = listRepositoryFiles(root)
  const violations = []
  let activationState
  for (const policy of manifest.policies) {
    if (selected.size > 0 && !selected.has(policy.id)) {
      continue
    }
    for (const rule of policy.rules) {
      if (rule.type !== 'change-scope' && rule.whenChanged) {
        activationState ??= collectChangedFiles(
          root,
          manifest,
          { comparison: 'base', baseRef: '$base' },
          baseRef
        )
        if (activationState.error) {
          violations.push(violation(policy, rule, 'activation-base-missing', activationState.error))
          continue
        }
        if (!isRuleActive(rule, activationState.files)) {
          continue
        }
      }
      if (rule.type === 'change-scope') {
        violations.push(...auditChangeScope(root, manifest, policy, rule, baseRef))
      } else if (rule.type === 'reference-parity') {
        violations.push(...auditReferenceParity(root, manifest, policy, rule, baseRef))
      } else if (rule.type === 'dependency-boundary') {
        violations.push(...auditDependencyBoundary(root, repositoryFiles, manifest, policy, rule))
      } else if (rule.type === 'forbidden-path') {
        violations.push(...auditForbiddenPaths(repositoryFiles, policy, rule))
      } else if (rule.type === 'forbidden-content') {
        violations.push(...auditForbiddenContent(root, repositoryFiles, policy, rule))
      }
    }
  }
  return sortViolations(violations)
}

function parseArguments(argv) {
  const options = { configPath: DEFAULT_CONFIG_PATH, policyIds: [], json: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--') {
      continue
    }
    if (argument === '--config' || argument === '--base' || argument === '--policy') {
      const value = argv[index + 1]
      if (!value) {
        throw new Error(`${argument} requires a value`)
      }
      index += 1
      if (argument === '--config') {
        options.configPath = value
      }
      if (argument === '--base') {
        options.baseRef = value
      }
      if (argument === '--policy') {
        options.policyIds.push(value)
      }
    } else if (argument === '--json') {
      options.json = true
    } else {
      throw new Error(`Unknown argument: ${argument}`)
    }
  }
  return options
}

function escapeAnnotation(value) {
  return value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')
}

function printViolations(violations) {
  for (const item of violations) {
    const location = item.path ? `${item.path}${item.line ? `:${item.line}` : ''}: ` : ''
    console.error(
      `${location}[${item.policyId}/${item.ruleId}/${item.code}] ${item.message}${
        item.detail ? ` (${item.detail})` : ''
      }`
    )
    if (item.path) {
      const fields = [`file=${item.path}`]
      if (item.line) {
        fields.push(`line=${item.line}`)
      }
      console.error(`::error ${fields.join(',')}::${escapeAnnotation(item.message)}`)
    }
  }
  console.error(`Architecture policy gate failed with ${violations.length} violation(s).`)
}

export function main(root = process.cwd(), argv = process.argv.slice(2)) {
  try {
    const options = parseArguments(argv)
    const manifest = loadArchitecturePolicyManifest(root, options.configPath)
    const violations = auditArchitecturePolicies({
      root,
      manifest,
      baseRef: options.baseRef,
      policyIds: options.policyIds
    })
    if (options.json) {
      console.log(JSON.stringify({ ok: violations.length === 0, violations }, null, 2))
    } else if (violations.length > 0) {
      printViolations(violations)
    } else {
      console.log(
        `Architecture policy gate OK — ${manifest.policies.length} policy set(s) checked.`
      )
    }
    return violations.length === 0 ? 0 : 1
  } catch (error) {
    console.error(`Architecture policy gate could not run: ${error.message}`)
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main()
}
