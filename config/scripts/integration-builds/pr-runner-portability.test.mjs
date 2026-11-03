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

const jobRunners = (job, repository) => {
  const choice = job.strategy?.matrix?.runner ?? job['runs-on']
  if (Array.isArray(choice)) {
    return choice
  }
  if (typeof choice !== 'string') {
    return []
  }
  if (!choice.startsWith('${{')) {
    return [choice]
  }
  return choice.includes('github.repository')
    ? runInNewContext(choice.slice(3, -2), { github: { repository }, fromJSON: JSON.parse })
    : []
}

// The warmups run on fork/integration's schedule, where a Blacksmith leg queues until GitHub drops it.
it.each(['stablyai/orca', 'Fartown/orca', 'another/orca'])(
  'warms Blacksmith caches only for upstream: %s',
  (repository) => {
    const jobs = ['ci-cache-warmup', 'ci-cache-warmup-platform-jobs'].flatMap((name) =>
      Object.values(readWorkflow(name).jobs)
    )
    for (const job of jobs.filter((candidate) => candidate.strategy?.matrix?.runner)) {
      expect(jobRunners(job, repository).length).toBeGreaterThan(0)
    }
    const runners = jobs.flatMap((job) => jobRunners(job, repository))
    expect(runners.some((runner) => runner.startsWith('blacksmith-'))).toBe(
      repository === 'stablyai/orca'
    )
    expect(
      jobRunners(
        readWorkflow('ci-cache-warmup-platform-jobs').jobs['warm-linux-runtime'],
        repository
      )
    ).toEqual(expect.arrayContaining(['ubuntu-24.04-arm', 'ubuntu-22.04']))
  }
)
