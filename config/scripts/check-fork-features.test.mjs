import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  evaluateForkFeatures,
  loadForkFeatureRegistry,
  validateForkFeatureRegistry
} from './check-fork-features.mjs'

const roots = []

async function tempRoot() {
  const root = await mkdtemp(join(tmpdir(), 'fork-features-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function registry() {
  return {
    schemaVersion: 1,
    upstream: { remote: 'origin', branch: 'main' },
    fork: { remote: 'fork', integrationBranch: 'fork/integration' },
    features: [
      {
        id: 'widgets',
        title: 'Widgets',
        journal: 'docs/issue/widgets/journal.md',
        policyId: 'widgets-policy',
        ownedPaths: ['src/main/widgets/**'],
        requiredFiles: ['src/main/widgets/widget-service.ts'],
        seams: [{ file: 'src/main/index.ts', mustContain: 'startWidgets', why: 'boot' }],
        tests: ['src/main/widgets/widget-service.test.ts'],
        checks: []
      }
    ]
  }
}

function manifest(allowedPaths = ['src/main/widgets/**', 'src/main/index.ts', 'docs/issue/**']) {
  return {
    policies: [
      { id: 'widgets-policy', rules: [] },
      {
        id: 'fork-upstream-diff-budget',
        rules: [{ id: 'fork-integration-scope', type: 'change-scope', allowedPaths }]
      }
    ]
  }
}

const healthyFiles = [
  'docs/issue/widgets/journal.md',
  'src/main/widgets/widget-service.ts',
  'src/main/widgets/widget-service.test.ts',
  'src/main/index.ts'
]

const contents = { 'src/main/index.ts': "import { startWidgets } from './widgets/widget-service'" }
const readFile = (file) => contents[file] ?? ''

describe('fork feature gate', () => {
  it('passes when every entry file, seam, test and journal is present and budgeted', () => {
    expect(
      evaluateForkFeatures({
        registry: registry(),
        policyManifest: manifest(),
        files: healthyFiles,
        readFile
      })
    ).toEqual([])
  })

  it('reports a lost entry file, test, journal and seam registration', () => {
    const violations = evaluateForkFeatures({
      registry: registry(),
      policyManifest: manifest(),
      files: ['src/main/index.ts', 'src/main/widgets/other.ts'],
      readFile: () => 'nothing registered here'
    })
    expect(violations.map((violation) => violation.file)).toEqual([
      'docs/issue/widgets/journal.md',
      'src/main/widgets/widget-service.ts',
      'src/main/index.ts',
      'src/main/widgets/widget-service.test.ts'
    ])
    expect(violations[2].message).toContain('lost "startWidgets" (boot)')
  })

  it('reports an owned glob with no files and an unknown policy', () => {
    const broken = registry()
    broken.features[0].ownedPaths.push('src/renderer/widgets/**')
    broken.features[0].policyId = 'missing-policy'
    const messages = evaluateForkFeatures({
      registry: broken,
      policyManifest: manifest(),
      files: healthyFiles,
      readFile
    }).map((violation) => violation.message)
    expect(messages).toEqual([
      'Feature widgets references unknown policy missing-policy.',
      'Feature widgets owns src/renderer/widgets/**, but no file matches it.'
    ])
  })

  it('reports files the upstream diff budget no longer allows, and a missing budget rule', () => {
    const unbudgeted = evaluateForkFeatures({
      registry: registry(),
      policyManifest: manifest(['docs/issue/**']),
      files: healthyFiles,
      readFile
    })
    expect(unbudgeted.map((violation) => violation.file)).toEqual([
      'src/main/widgets/widget-service.ts',
      'src/main/widgets/widget-service.test.ts',
      'src/main/index.ts'
    ])
    const noBudget = evaluateForkFeatures({
      registry: registry(),
      policyManifest: { policies: [{ id: 'widgets-policy', rules: [] }] },
      files: healthyFiles,
      readFile
    })
    expect(noBudget).toHaveLength(1)
    expect(noBudget[0].message).toContain('fork-upstream-diff-budget')
  })

  it('validates the registry shape and parses JSONC with comments', async () => {
    expect(validateForkFeatureRegistry({ schemaVersion: 2, features: [] })).toContain(
      'schemaVersion must be 1'
    )
    const root = await tempRoot()
    await writeFile(
      join(root, 'features.jsonc'),
      `{\n  // comment\n  ${JSON.stringify(registry()).slice(1, -1)},\n}\n`
    )
    expect(loadForkFeatureRegistry(root, 'features.jsonc').features[0].id).toBe('widgets')
    await writeFile(join(root, 'bad.jsonc'), '{ "schemaVersion": 1, "features": [{ "id": "" }] }')
    expect(() => loadForkFeatureRegistry(root, 'bad.jsonc')).toThrow(/features\[0\]\.id/)
  })

  it('requires upstream imports to be declared in dependsOn and declared dependencies to exist', () => {
    const declared = registry()
    declared.features[0].dependsOn = ['src/main/core/**', 'src/main/gone/**']
    const files = [...healthyFiles, 'src/main/core/thing.ts', 'src/main/stray/other.ts']
    const sources = {
      ...contents,
      'src/main/widgets/widget-service.ts':
        "import { a } from '../core/thing'\nimport { b } from '../stray/other'\nimport { c } from './widget-helpers'"
    }
    const messages = evaluateForkFeatures({
      registry: declared,
      policyManifest: { ...manifest(), aliases: [] },
      files,
      readFile: (file) => sources[file] ?? ''
    }).map((violation) => violation.message)
    expect(messages).toEqual([
      expect.stringContaining('depends on src/main/gone/**, but no file matches it'),
      expect.stringContaining('imports src/main/stray/other.ts, which is not declared')
    ])
  })

  it('does not audit imports from tests or e2e scaffolding', () => {
    const declared = registry()
    declared.features[0].ownedPaths = ['src/main/widgets/**', 'tests/e2e/helpers/widget-*.ts']
    const files = [...healthyFiles, 'tests/e2e/helpers/widget-journey.ts']
    const sources = {
      ...contents,
      'src/main/widgets/widget-service.test.ts': "import { x } from '../../shared/anything'",
      'tests/e2e/helpers/widget-journey.ts': "import { y } from './other-journey'"
    }
    expect(
      evaluateForkFeatures({
        registry: declared,
        policyManifest: {
          ...manifest(['src/main/widgets/**', 'src/main/index.ts', 'docs/issue/**', 'tests/**']),
          aliases: []
        },
        files,
        readFile: (file) => sources[file] ?? ''
      })
    ).toEqual([])
  })
})
