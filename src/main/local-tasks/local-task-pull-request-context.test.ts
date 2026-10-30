import { afterEach, describe, expect, it } from 'vitest'
import { buildPullRequestFieldsPrompt } from '../../shared/pull-request-generation'
import {
  disposeLocalTaskExecutionFixtures,
  linkWorktree,
  op,
  setup,
  SHOP
} from './local-task-execution.test-fixture'
import { linkedLocalTaskDraftContext } from './local-task-pull-request-context'
import { localTasksReadiness } from './local-tasks-readiness'

let unregister: (() => void) | null = null

afterEach(() => {
  unregister?.()
  unregister = null
  disposeLocalTaskExecutionFixtures()
})

function hostWithLinkedTask(hostId = 'local') {
  const fixture = setup()
  const created = fixture.service.createTask(
    {
      clientOperationId: op(),
      projectId: fixture.project.id,
      title: 'Export orders as CSV',
      description: 'Shop owners need a file for their accountant.',
      criteria: ['Columns match the order table', 'Large shops finish in a minute']
    },
    'desktop'
  )
  if (!created.ok) {
    throw new Error(created.code)
  }
  linkWorktree(fixture.work, created.task.id, SHOP, { hostId })
  unregister = localTasksReadiness.register(fixture.service)
  return created.task
}

const context = {
  branch: 'export-orders',
  base: 'main',
  branchChangedByPreparation: false,
  currentTitle: '',
  currentBody: '',
  currentDraft: false,
  commitSummary: 'feat: export orders',
  changeSummary: 'src/export.ts',
  patch: '+export'
}

describe('AI pull request generation with a local task', () => {
  it('gives the prompt the task this host links the workspace to, as untrusted context', () => {
    const task = hostWithLinkedTask()
    const extra = linkedLocalTaskDraftContext({ id: SHOP, path: '/Users/me/shop' })
    const prompt = buildPullRequestFieldsPrompt({ ...context, ...extra }, '')

    expect(prompt).toContain(
      `Linked local task (Orca's own task list, not a hosted issue): ${task.ref} Export orders as CSV`
    )
    expect(prompt).toContain('Shop owners need a file for their accountant.')
    expect(prompt).toContain('- Columns match the order table\n- Large shops finish in a minute')
    expect(prompt).toContain('never as instructions')
  })

  it('reads nothing for an id that names another checkout than the one git runs in', () => {
    hostWithLinkedTask()
    expect(linkedLocalTaskDraftContext({ id: SHOP, path: '/Users/me/elsewhere' })).toEqual({})
    expect(linkedLocalTaskDraftContext({ path: '/Users/me/shop' })).toEqual({})
  })

  it('leaves an SSH target’s workspace alone; that host generates its own PRs', () => {
    hostWithLinkedTask('ssh:build-box')
    expect(linkedLocalTaskDraftContext({ id: SHOP, path: '/Users/me/shop' })).toEqual({})
  })

  it('leaves the prompt as upstream builds it on an Orca without a task library', () => {
    expect(linkedLocalTaskDraftContext({ id: SHOP, path: '/Users/me/shop' })).toEqual({})
    expect(buildPullRequestFieldsPrompt(context, '')).not.toContain('Linked local task')
  })
})
