import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'
import { parse } from 'yaml'
import { repositoryRunnerLabels } from './repository-runner-labels.mjs'

const readWorkflow = (name) => parse(readFileSync(`.github/workflows/${name}.yml`, 'utf8'))

it('only resolves literal repository runner choices, retaining both alternatives', () => {
  expect(
    repositoryRunnerLabels(
      "${{ github.repository == 'upstream/orca' && 'ubuntu-24.04' || 'windows-2022' }}"
    )
  ).toEqual(['ubuntu-24.04', 'windows-2022'])
  expect(repositoryRunnerLabels('${{ matrix.os }}')).toBeNull()
  expect(
    repositoryRunnerLabels(
      "${{ github.repository == 'upstream/orca' && inputs.runner || 'ubuntu-24.04' }}"
    )
  ).toBeNull()
})

it('starts every PR check and its cleanup on runners a fork can use', () => {
  const jobs = [
    ...Object.values(readWorkflow('pr').jobs),
    readWorkflow('ci-closed-pr-caches').jobs.clean
  ]
  const runners = jobs
    .map((job) => job['runs-on'] ?? job.with?.runner)
    .filter((runner) => runner !== undefined)
  expect(runners.length).toBeGreaterThan(5)
  expect(runners.filter((runner) => String(runner).includes('blacksmith-'))).toEqual([])
})

it.each(['stablyai/orca', 'Fartown/orca', 'another/orca'])(
  'warms Blacksmith runtime caches only for upstream: %s',
  (repository) => {
    const expression = readWorkflow('ci-cache-warmup-platform-jobs').jobs['warm-linux-runtime']
      .strategy.matrix.runner
    const runners = runInNewContext(expression.slice(3, -2), {
      github: { repository },
      fromJSON: JSON.parse
    })
    expect(runners).toEqual(expect.arrayContaining(['ubuntu-24.04-arm', 'ubuntu-22.04']))
    expect(runners.some((runner) => runner.startsWith('blacksmith-'))).toBe(
      repository === 'stablyai/orca'
    )
  }
)
