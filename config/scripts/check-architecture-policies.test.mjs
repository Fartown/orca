import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  auditArchitecturePolicies,
  loadArchitecturePolicyManifest,
  validateArchitecturePolicyManifest
} from './check-architecture-policies.mjs'
import {
  extractModuleSpecifiers,
  matchesPathPattern,
  resolveRepositoryImport
} from './architecture-policy-matching.mjs'

const temporaryRepositories = []

function runGit(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
}

function writeRepositoryFile(root, file, content) {
  const absolutePath = path.join(root, file)
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
  fs.writeFileSync(absolutePath, content)
}

function createRepository(files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orca-architecture-policy-'))
  temporaryRepositories.push(root)
  runGit(root, ['init', '--quiet'])
  runGit(root, ['config', 'user.name', 'Architecture Policy Test'])
  runGit(root, ['config', 'user.email', 'architecture-policy@example.invalid'])
  for (const [file, content] of Object.entries(files)) {
    writeRepositoryFile(root, file, content)
  }
  runGit(root, ['add', '.'])
  runGit(root, ['commit', '--quiet', '--allow-empty', '-m', 'baseline'])
  return root
}

function manifestWithRules(rules) {
  return {
    schemaVersion: 1,
    defaultBaseRef: 'HEAD',
    aliases: [{ prefix: '@/', replacement: 'src/ui/' }],
    policies: [{ id: 'sample-architecture', rules }]
  }
}

afterEach(() => {
  for (const root of temporaryRepositories.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe('architecture path and import matching', () => {
  it('supports recursive and single-segment repository globs', () => {
    expect(matchesPathPattern('src/main/file.ts', 'src/main/**/*.ts')).toBe(true)
    expect(matchesPathPattern('src/main/nested/file.ts', 'src/main/**/*.ts')).toBe(true)
    expect(matchesPathPattern('src/main/nested/file.tsx', 'src/main/**/*.ts')).toBe(false)
    expect(
      matchesPathPattern('tests/e2e/feature-flow.spec.ts', 'tests/e2e/*feature*.spec.ts')
    ).toBe(true)
  })

  it('extracts static, exported, required, and dynamic module edges without reading comments', () => {
    const source = `
      // import './comment-only'
      const falsePositive = /import from 'regex-only'/
      import value from './static'
      import legacy = require('./legacy')
      export { other } from './exported'
      const lazy = import('./dynamic')
      const loaded = require('./required')
      const nested = \`value \${import('./inside-template')}\`
    `
    expect(
      extractModuleSpecifiers(source, 'src/native.ts').map((entry) => entry.specifier)
    ).toEqual([
      './static',
      './legacy',
      './exported',
      './dynamic',
      './required',
      './inside-template'
    ])
  })

  it('resolves aliases and extensionless relative imports against repository files', () => {
    const files = new Set(['src/ui/domain/model.ts', 'src/native/entry.ts'])
    expect(
      resolveRepositoryImport(
        '@/domain/model',
        'src/native/entry.ts',
        [{ prefix: '@/', replacement: 'src/ui/' }],
        files
      )
    ).toBe('src/ui/domain/model.ts')
    expect(resolveRepositoryImport('../ui/domain/model', 'src/native/entry.ts', [], files)).toBe(
      'src/ui/domain/model.ts'
    )
  })
})

describe('architecture policy validation', () => {
  it('rejects unknown rule types and invalid source expressions', () => {
    const manifest = manifestWithRules([
      { id: 'unknown', type: 'parallel-state-machine' },
      {
        id: 'bad-pattern',
        type: 'forbidden-content',
        files: ['src/**'],
        patterns: [{ id: 'broken', regex: '(' }]
      }
    ])
    expect(validateArchitecturePolicyManifest(manifest)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('parallel-state-machine'),
        expect.stringContaining('regex is invalid')
      ])
    )
  })

  it('loads comments and trailing commas from a JSONC policy file', () => {
    const root = createRepository()
    writeRepositoryFile(
      root,
      'policy.jsonc',
      `{
        // reusable policy fixture
        "schemaVersion": 1,
        "defaultBaseRef": "HEAD",
        "aliases": [],
        "policies": [{
          "id": "fixture",
          "rules": [{ "id": "paths", "type": "forbidden-path", "paths": ["tmp/**"], }],
        }],
      }`
    )
    expect(loadArchitecturePolicyManifest(root, 'policy.jsonc').policies[0].id).toBe('fixture')
  })
})

describe('architecture policy audits', () => {
  it('finds a reverse dependency while allowing the declared composition root', () => {
    const root = createRepository({
      'src/domain/model.ts': 'export const model = true\n',
      'src/native/core.ts': "import { model } from '../domain/model'\nexport { model }\n",
      'src/composition.ts': "import { model } from './domain/model'\nexport { model }\n"
    })
    const manifest = manifestWithRules([
      {
        id: 'domain-boundary',
        type: 'dependency-boundary',
        sourceFiles: ['src/**/*.ts'],
        exceptPaths: ['src/domain/**', 'src/composition.ts'],
        forbiddenTargets: ['src/domain/**']
      }
    ])

    expect(auditArchitecturePolicies({ root, manifest })).toEqual([
      expect.objectContaining({
        code: 'forbidden-dependency',
        path: 'src/native/core.ts',
        detail: 'src/domain/model.ts'
      })
    ])
  })

  it('reports forbidden paths and source-owned state with line locations', () => {
    const root = createRepository({
      'src/domain/parallel-cache.ts': 'export const state = { livenessVerdict: "live" }\n'
    })
    const manifest = manifestWithRules([
      {
        id: 'removed-files',
        type: 'forbidden-path',
        paths: ['src/domain/parallel-cache.ts']
      },
      {
        id: 'state-ownership',
        type: 'forbidden-content',
        files: ['src/domain/**/*.ts'],
        patterns: [{ id: 'liveness', regex: '\\blivenessVerdict\\b' }]
      }
    ])

    expect(auditArchitecturePolicies({ root, manifest })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'forbidden-path', path: 'src/domain/parallel-cache.ts' }),
        expect.objectContaining({
          code: 'forbidden-content:liveness',
          path: 'src/domain/parallel-cache.ts',
          line: 1
        })
      ])
    )
  })

  it('activates a worktree scope only when its trigger changes', () => {
    const root = createRepository({ 'src/domain/baseline.ts': 'export {}\n' })
    const rule = {
      id: 'focused-worktree',
      type: 'change-scope',
      comparison: 'worktree',
      whenChanged: ['src/domain/**'],
      allowedPaths: ['src/domain/**']
    }
    const manifest = manifestWithRules([rule])

    writeRepositoryFile(root, 'src/domain/new.ts', 'export {}\n')
    writeRepositoryFile(root, 'unrelated/noise.ts', 'export {}\n')
    expect(auditArchitecturePolicies({ root, manifest })).toEqual([
      expect.objectContaining({ code: 'path-outside-scope', path: 'unrelated/noise.ts' })
    ])

    fs.rmSync(path.join(root, 'src/domain/new.ts'))
    expect(auditArchitecturePolicies({ root, manifest })).toEqual([])
  })

  it('applies whenChanged to rule types that do not collect their own diff', () => {
    const root = createRepository({
      'src/guarded/state.ts': 'export const forbiddenState = true\n',
      'src/unrelated/baseline.ts': 'export {}\n'
    })
    const manifest = manifestWithRules([
      {
        id: 'conditional-state-boundary',
        type: 'forbidden-content',
        whenChanged: ['src/trigger/**'],
        files: ['src/guarded/**'],
        patterns: [{ id: 'state', regex: '\\bforbiddenState\\b' }]
      }
    ])

    writeRepositoryFile(root, 'src/unrelated/change.ts', 'export {}\n')
    expect(auditArchitecturePolicies({ root, manifest })).toEqual([])

    writeRepositoryFile(root, 'src/trigger/change.ts', 'export {}\n')
    expect(auditArchitecturePolicies({ root, manifest })).toEqual([
      expect.objectContaining({
        code: 'forbidden-content:state',
        path: 'src/guarded/state.ts'
      })
    ])
  })

  it('detects reference drift independently of the current diff allowlist', () => {
    const root = createRepository({
      'src/native/reused.ts': 'export const behavior = "baseline"\n'
    })
    writeRepositoryFile(root, 'src/native/reused.ts', 'export const behavior = "forked"\n')
    const manifest = manifestWithRules([
      {
        id: 'native-parity',
        type: 'reference-parity',
        reference: '$base',
        paths: ['src/native/**']
      }
    ])

    expect(auditArchitecturePolicies({ root, manifest })).toEqual([
      expect.objectContaining({ code: 'reference-drift', path: 'src/native/reused.ts' })
    ])
  })

  it('rejects a feature branch that is not based on the selected base ref', () => {
    const root = createRepository({ 'src/domain/baseline.ts': 'export {}\n' })
    const common = runGit(root, ['rev-parse', 'HEAD'])
    writeRepositoryFile(root, 'src/domain/feature.ts', 'export {}\n')
    runGit(root, ['add', '.'])
    runGit(root, ['commit', '--quiet', '-m', 'feature'])
    const tree = runGit(root, ['rev-parse', `${common}^{tree}`])
    const divergentBase = runGit(root, ['commit-tree', tree, '-p', common, '-m', 'advanced base'])
    runGit(root, ['update-ref', 'refs/heads/upstream', divergentBase])
    const manifest = manifestWithRules([
      {
        id: 'latest-base',
        type: 'change-scope',
        comparison: 'base',
        baseRef: 'upstream',
        requireBaseAncestor: true,
        whenChanged: ['src/domain/**'],
        allowedPaths: ['**']
      }
    ])

    expect(auditArchitecturePolicies({ root, manifest })).toEqual([
      expect.objectContaining({ code: 'base-not-ancestor' })
    ])
  })
})
