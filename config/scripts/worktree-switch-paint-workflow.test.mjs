import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const root = resolve(import.meta.dirname, '../..')
const workflow = parse(readFileSync(resolve(root, '.github/workflows/e2e.yml'), 'utf8'))
const specPath = 'tests/e2e/worktree-switch-first-paint.spec.ts'
const spec = readFileSync(resolve(root, specPath), 'utf8')

describe('worktree first-paint CI coverage', () => {
  it('runs the headful contract once in full runs without changing headless shards', () => {
    const job = workflow.jobs.e2e
    // Upstream #20197 took over running this spec on a mapped window, and its own contract
    // test pins that there is exactly one such step — so the fork asserts against upstream's
    // step rather than adding a second one.
    const step = job.steps.find((entry) => entry.name?.startsWith('Run worktree first-paint'))
    expect(job.if).toBe("inputs.test_files == ''")
    expect(step.if).toBe("matrix.shard == '1/14'")
    expect(step.run).toContain('xvfb-run --auto-servernum')
    expect(step.run).toContain(specPath)
    expect(step.run).toContain('--project=electron-headful --workers=1')
    // Upstream moved full runs from a shard flag to a precomputed spec list; what the fork
    // cares about is that the headless lane still runs separately from the headful step.
    expect(job.steps.find((entry) => entry.name?.startsWith('Run E2E tests')).run).toContain(
      'pnpm run test:e2e --test-list=ci-shards/selected.txt'
    )
    expect(spec).toContain('Worktree switch first paint @headful')
  })

  it('keeps PR selection and successful final-state evidence', () => {
    const changed = workflow.jobs['changed-e2e'].steps
    expect(changed.find((step) => step.name === 'Run changed E2E specs').run).toContain(
      'E2E_PROJECT_ARGS+=(--project=electron-headful)'
    )
    expect(changed.find((step) => step.name === 'Upload Playwright traces').if).toBe(
      `failure() || contains(inputs.test_files, '${specPath}')`
    )
    expect(
      workflow.jobs.e2e.steps.find((step) => step.name === 'Upload Playwright traces').if
    ).toBe("failure() || matrix.shard == '1/14'")
    expect(spec).toContain("testInfo.attach('first-paint-final.png'")
    expect(spec).toContain('orcaPage.screenshot({ path: screenshotPath })')
    expect(spec).toContain('path: screenshotPath,')
  })
})
