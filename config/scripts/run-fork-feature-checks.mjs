#!/usr/bin/env node
// Runs every `checks` command registered in config/fork-features.jsonc, in order, and stops
// at the first failure. Shared by `pnpm sync:upstream` and the sync-upstream workflow so the
// two never drift on what "the fork still works" means.
//
// Usage: node config/scripts/run-fork-feature-checks.mjs [--feature <id>] [--list]
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { loadForkFeatureRegistry } from './check-fork-features.mjs'

export function forkFeatureCheckSteps(registry, featureId = null) {
  return registry.features
    .filter((feature) => !featureId || feature.id === featureId)
    .flatMap((feature) => feature.checks.map((command) => ({ featureId: feature.id, command })))
}

export function runForkFeatureChecks(root, steps, run = shell) {
  for (const step of steps) {
    console.log(`\n[${step.featureId}] $ ${step.command}`)
    if (run(root, step.command) !== 0) {
      console.error(`\n[${step.featureId}] ${step.command} failed.`)
      return 1
    }
  }
  console.log(`\nFork feature checks passed: ${steps.length} command(s).`)
  return 0
}

function shell(root, command) {
  const result = spawnSync(command, { cwd: root, shell: true, stdio: 'inherit' })
  return result.status ?? 1
}

function main(argv) {
  const root = path.resolve(import.meta.dirname, '..', '..')
  const registry = loadForkFeatureRegistry(root)
  const featureIndex = argv.indexOf('--feature')
  const featureId = featureIndex === -1 ? null : (argv[featureIndex + 1] ?? null)
  const steps = forkFeatureCheckSteps(registry, featureId)
  if (argv.includes('--list')) {
    for (const step of steps) {
      console.log(`[${step.featureId}] ${step.command}`)
    }
    return 0
  }
  if (steps.length === 0) {
    console.error(`No checks registered${featureId ? ` for feature ${featureId}` : ''}.`)
    return 1
  }
  return runForkFeatureChecks(root, steps)
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  process.exitCode = main(process.argv.slice(2))
}
