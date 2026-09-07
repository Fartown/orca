#!/usr/bin/env node
/**
 * Bundle the goal driver the host launches as a detached plain-Node process.
 *
 * Same shape as build-relay.mjs: one self-contained CommonJS file with the
 * prompt templates inlined, so the running driver never reads a file from the
 * app bundle again after startup and an app update cannot pull a template out
 * from under a live goal. Main resolves it from out/goal-driver in dev and from
 * extraResources when packaged.
 */
import { build } from 'esbuild'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..', '..')
const ENTRY = join(ROOT, 'goal-mode', 'cli', 'goal-driver-entry.mjs')
const JUDGE_ENTRY = join(ROOT, 'goal-mode', 'cli', 'acceptance-judge.mjs')
const OUT_DIR = process.env.ORCA_GOAL_DRIVER_OUT_DIR ?? join(ROOT, 'out', 'goal-driver')
const OUT_FILE = join(OUT_DIR, 'goal-driver.js')
const JUDGE_OUT_FILE = join(OUT_DIR, 'acceptance-judge.js')
const DRIVER_VERSION = '0.1.0'

rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(OUT_DIR, { recursive: true })

await build({
  entryPoints: [ENTRY],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: OUT_FILE,
  external: ['electron'],
  // Why: prompts/*.md become strings; continuation-prompt.mjs receives them via setTemplateSource.
  loader: { '.md': 'text' },
  sourcemap: false,
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"' }
})

// Why a second bundle: the driver launches the item-mode judge as its own process
// (config/scripts/build-goal-driver.mjs keeps both in one directory, see goal-record-projection.mjs).
await build({
  entryPoints: [JUDGE_ENTRY],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: JUDGE_OUT_FILE,
  external: ['electron'],
  sourcemap: false,
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"' }
})

const hash = createHash('sha256')
  .update(readFileSync(OUT_FILE))
  .update(readFileSync(JUDGE_OUT_FILE))
  .digest('hex')
  .slice(0, 12)
writeFileSync(join(OUT_DIR, '.version'), `${DRIVER_VERSION}+${hash}`)
console.log(`Built goal driver → ${OUT_FILE}\nBuilt acceptance judge → ${JUDGE_OUT_FILE}`)
