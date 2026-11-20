import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'
import { parse } from 'yaml'

// Closing a fork PR must also cancel its package build, which runs in its own concurrency group.
const workflow = parse(readFileSync('.github/workflows/ci-closed-pr-caches.yml', 'utf8'))
const step = workflow.jobs.clean.steps[0]
const closed = { number: 123, closed_at: '2026-10-06T00:00:00Z' }
const current = { ...closed, state: 'closed', merged_at: null }
const run = {
  id: 42,
  event: 'pull_request',
  path: '.github/workflows/pr.yml',
  status: 'in_progress',
  created_at: '2026-10-05T23:59:00Z'
}

function execute() {
  const request = vi.fn(async (_route, args) => {
    if (args.concurrency_group_name !== 'pr-checks-123') {
      throw { status: 404 }
    }
    return { data: { group_name: 'pr-checks-123', group_members: [{ run_id: 42 }] } }
  })
  const result = runInNewContext(`(async () => { ${step.with.script} })()`, {
    context: {
      repo: { owner: 'owner', repo: 'repo' },
      payload: { action: 'closed', pull_request: closed }
    },
    github: {
      request,
      rest: {
        pulls: { get: vi.fn(async () => ({ data: current })) },
        actions: {
          getWorkflowRun: vi.fn(async () => ({ data: run })),
          cancelWorkflowRun: vi.fn(async () => {})
        }
      }
    },
    core: { info: vi.fn() }
  })
  return { result, request }
}

it('looks up the fork integration package group of the PR', async () => {
  const { result, request } = execute()
  await result
  expect(request.mock.calls.map(([, args]) => args.concurrency_group_name)).toContain(
    'fork-integration-build-123-packages'
  )
})
