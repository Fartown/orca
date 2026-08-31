import fs from 'node:fs'
import path from 'node:path'
import { parse, printParseErrorCode } from 'jsonc-parser'

const SUPPORTED_RULE_TYPES = new Set([
  'change-scope',
  'reference-parity',
  'dependency-boundary',
  'forbidden-path',
  'forbidden-content'
])

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function isStringArray(value, { allowEmpty = false } = {}) {
  return (
    Array.isArray(value) &&
    (allowEmpty || value.length > 0) &&
    value.every((item) => isNonEmptyString(item))
  )
}

function requireStringArray(owner, value, errors, options) {
  if (!isStringArray(value, options)) {
    errors.push(`${owner} must be ${options?.allowEmpty ? 'an' : 'a non-empty'} array of strings`)
  }
}

function validateRule(policyId, rule, index, errors, ids) {
  const owner = `${policyId}.rules[${index}]`
  if (!isRecord(rule)) {
    errors.push(`${owner} must be an object`)
    return
  }
  if (!isNonEmptyString(rule.id)) {
    errors.push(`${owner}.id must be a non-empty string`)
  } else if (ids.has(rule.id)) {
    errors.push(`${policyId} has duplicate rule id: ${rule.id}`)
  } else {
    ids.add(rule.id)
  }
  if (!SUPPORTED_RULE_TYPES.has(rule.type)) {
    errors.push(
      `${owner}.type ${String(rule.type)} must be one of ${[...SUPPORTED_RULE_TYPES].join(', ')}`
    )
    return
  }
  if (rule.whenChanged !== undefined) {
    requireStringArray(`${owner}.whenChanged`, rule.whenChanged, errors)
  }
  if (rule.exceptPaths !== undefined) {
    requireStringArray(`${owner}.exceptPaths`, rule.exceptPaths, errors, { allowEmpty: true })
  }

  if (rule.type === 'change-scope') {
    if (!['base', 'worktree'].includes(rule.comparison)) {
      errors.push(`${owner}.comparison must be base or worktree`)
    }
    requireStringArray(`${owner}.allowedPaths`, rule.allowedPaths, errors)
    if (rule.maxChangedFiles !== undefined && !Number.isInteger(rule.maxChangedFiles)) {
      errors.push(`${owner}.maxChangedFiles must be an integer when provided`)
    }
  } else if (rule.type === 'reference-parity') {
    if (!isNonEmptyString(rule.reference)) {
      errors.push(`${owner}.reference must be a non-empty string`)
    }
    requireStringArray(`${owner}.paths`, rule.paths, errors)
  } else if (rule.type === 'dependency-boundary') {
    requireStringArray(`${owner}.sourceFiles`, rule.sourceFiles, errors)
    requireStringArray(`${owner}.forbiddenTargets`, rule.forbiddenTargets, errors)
    if (rule.importTextHints !== undefined) {
      requireStringArray(`${owner}.importTextHints`, rule.importTextHints, errors)
    }
  } else if (rule.type === 'forbidden-path') {
    requireStringArray(`${owner}.paths`, rule.paths, errors)
  } else if (rule.type === 'forbidden-content') {
    requireStringArray(`${owner}.files`, rule.files, errors)
    validateContentPatterns(owner, rule.patterns, errors)
  }
}

function validateContentPatterns(owner, patterns, errors) {
  if (!Array.isArray(patterns) || patterns.length === 0) {
    errors.push(`${owner}.patterns must be a non-empty array`)
    return
  }
  for (const [index, pattern] of patterns.entries()) {
    const patternOwner = `${owner}.patterns[${index}]`
    if (!isRecord(pattern) || !isNonEmptyString(pattern.id) || !isNonEmptyString(pattern.regex)) {
      errors.push(`${patternOwner} must contain non-empty id and regex strings`)
      continue
    }
    try {
      new RegExp(pattern.regex, pattern.flags ?? '')
    } catch (error) {
      errors.push(`${patternOwner}.regex is invalid: ${error.message}`)
    }
  }
}

export function validateArchitecturePolicyManifest(manifest) {
  const errors = []
  if (!isRecord(manifest)) {
    return ['manifest must be an object']
  }
  if (manifest.schemaVersion !== 1) {
    errors.push('schemaVersion must be 1')
  }
  if (!isNonEmptyString(manifest.defaultBaseRef)) {
    errors.push('defaultBaseRef must be a non-empty string')
  }
  validateAliases(manifest.aliases, errors)
  if (!Array.isArray(manifest.policies) || manifest.policies.length === 0) {
    errors.push('policies must be a non-empty array')
    return errors
  }

  const policyIds = new Set()
  for (const [index, policy] of manifest.policies.entries()) {
    const owner = `policies[${index}]`
    if (!isRecord(policy) || !isNonEmptyString(policy.id)) {
      errors.push(`${owner}.id must be a non-empty string`)
      continue
    }
    if (policyIds.has(policy.id)) {
      errors.push(`duplicate policy id: ${policy.id}`)
    }
    policyIds.add(policy.id)
    if (!Array.isArray(policy.rules) || policy.rules.length === 0) {
      errors.push(`${owner}.rules must be a non-empty array`)
      continue
    }
    const ruleIds = new Set()
    policy.rules.forEach((rule, ruleIndex) =>
      validateRule(policy.id, rule, ruleIndex, errors, ruleIds)
    )
  }
  return errors
}

function validateAliases(aliases, errors) {
  if (!Array.isArray(aliases)) {
    errors.push('aliases must be an array')
    return
  }
  for (const [index, alias] of aliases.entries()) {
    if (
      !isRecord(alias) ||
      !isNonEmptyString(alias.prefix) ||
      !isNonEmptyString(alias.replacement)
    ) {
      errors.push(`aliases[${index}] must contain non-empty prefix and replacement strings`)
    }
  }
}

export function loadArchitecturePolicyManifest(
  root,
  configPath = 'config/architecture-policies.jsonc'
) {
  const absolutePath = path.resolve(root, configPath)
  const source = fs.readFileSync(absolutePath, 'utf8')
  const parseErrors = []
  const manifest = parse(source, parseErrors, { allowTrailingComma: true })
  if (parseErrors.length > 0) {
    const details = parseErrors
      .map((error) => `${printParseErrorCode(error.error)} at offset ${error.offset}`)
      .join(', ')
    throw new Error(`Invalid JSONC in ${configPath}: ${details}`)
  }
  const validationErrors = validateArchitecturePolicyManifest(manifest)
  if (validationErrors.length > 0) {
    throw new Error(`Invalid architecture policy manifest:\n- ${validationErrors.join('\n- ')}`)
  }
  return manifest
}
