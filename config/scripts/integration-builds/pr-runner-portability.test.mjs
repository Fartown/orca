import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'
import { parse } from 'yaml'

const readWorkflow = (name) => parse(readFileSync(`.github/workflows/${name}.yml`, 'utf8'))

it.each(['stablyai/orca', 'Fartown/orca', 'another/orca'])(
  'keeps every required PR runner available for %s without changing upstream',
  (repository) => {
    const pr = readWorkflow('pr')
    const routes = [
      [pr.jobs.code_paths['runs-on'], 'blacksmith-2vcpu-ubuntu-2404', 'ubuntu-24.04'],
      [pr.jobs.preflight['runs-on'], 'blacksmith-8vcpu-ubuntu-2404', 'ubuntu-24.04'],
      [pr.jobs.test.with.runner, 'blacksmith-4vcpu-ubuntu-2404', 'ubuntu-24.04'],
      [pr.jobs.dependency_isolation['runs-on'], 'blacksmith-4vcpu-ubuntu-2404', 'ubuntu-24.04'],
      [pr.jobs.verify['runs-on'], 'blacksmith-2vcpu-ubuntu-2204', 'ubuntu-22.04'],
      [
        readWorkflow('ci-closed-pr-caches').jobs.clean['runs-on'],
        'blacksmith-2vcpu-ubuntu-2204',
        'ubuntu-22.04'
      ]
    ]
    for (const [expression, upstream, fork] of routes) {
      expect(runInNewContext(expression.slice(3, -2), { github: { repository } })).toBe(
        repository === 'stablyai/orca' ? upstream : fork
      )
    }
  }
)
