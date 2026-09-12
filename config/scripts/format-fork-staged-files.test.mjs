import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { filesRequiringFormat } from './format-fork-staged-files.mjs'

const roots = []
const upstreamSource = 'export const value=1\n'
const script = path.join(import.meta.dirname, 'format-fork-staged-files.mjs')
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()

it('retains both lint checks before the fork-aware formatter', () => {
  const manifest = JSON.parse(
    readFileSync(path.join(import.meta.dirname, '../../package.json'), 'utf8')
  )
  const tasks = Object.values(manifest['lint-staged']).find((commands) =>
    commands.includes('node config/scripts/format-fork-staged-files.mjs')
  )
  expect(tasks).toEqual([
    'oxlint',
    'oxlint --config config/oxlint-react-doctor.json',
    'node config/scripts/format-fork-staged-files.mjs'
  ])
})

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'orca-format-fork-'))
  roots.push(root)
  git(root, ['init', '--quiet'])
  git(root, ['config', 'user.email', 'format@example.invalid'])
  git(root, ['config', 'user.name', 'Format Test'])
  git(root, ['config', 'core.autocrlf', 'false'])
  git(root, ['config', 'core.hooksPath', path.join(root, 'no-hooks')])
  git(root, ['config', 'commit.gpgsign', 'false'])
  writeFileSync(path.join(root, 'upstream.ts'), upstreamSource)
  git(root, ['add', '.'])
  git(root, ['commit', '--quiet', '-m', 'upstream'])
  git(root, ['update-ref', 'refs/remotes/origin/main', 'HEAD'])
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

it('preserves exact upstream restores while formatting semantic changes and new paths', () => {
  const root = fixture()
  writeFileSync(path.join(root, 'upstream.ts'), 'export const value = 1\n')
  git(root, ['add', '.'])
  git(root, ['commit', '--quiet', '-m', 'format churn'])
  writeFileSync(path.join(root, 'upstream.ts'), upstreamSource)
  writeFileSync(path.join(root, 'new file.ts'), 'export const added=2\n')
  const files = ['upstream.ts', 'new file.ts'].map((file) => path.join(root, file))
  expect(filesRequiringFormat(root, files)).toEqual([files[1]])
  execFileSync(process.execPath, [script, ...files], { cwd: root })
  expect(readFileSync(files[0], 'utf8')).toBe(upstreamSource)
  expect(readFileSync(files[1], 'utf8')).not.toBe('export const added=2\n')
  writeFileSync(files[0], 'export const value=3\n')
  expect(filesRequiringFormat(root, files)).toEqual(files)
})

it('uses merged upstream history, not an upstream commit the feature has not merged', () => {
  const root = fixture()
  const base = git(root, ['rev-parse', 'HEAD'])
  writeFileSync(path.join(root, 'upstream.ts'), 'export const value=2\n')
  git(root, ['add', '.'])
  git(root, ['commit', '--quiet', '-m', 'upstream advances'])
  git(root, ['update-ref', 'refs/remotes/origin/main', 'HEAD'])
  git(root, ['checkout', '--quiet', '--detach', base])
  expect(filesRequiringFormat(root, ['upstream.ts'])).toEqual([])
})

it('runs normal formatting when the upstream reference is unavailable', () => {
  const root = fixture()
  git(root, ['update-ref', '-d', 'refs/remotes/origin/main'])
  expect(filesRequiringFormat(root, ['upstream.ts'])).toEqual(['upstream.ts'])
  execFileSync(process.execPath, [script, path.join(root, 'upstream.ts')], { cwd: root })
  expect(readFileSync(path.join(root, 'upstream.ts'), 'utf8')).not.toBe(upstreamSource)
})
