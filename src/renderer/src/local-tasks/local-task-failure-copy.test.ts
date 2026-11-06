import { describe, expect, it } from 'vitest'
import type { LocalTask, LocalTaskFailureCode } from '../../../shared/local-tasks/local-task-types'
import type { LocalTaskEndpointKey } from './local-task-endpoints'
import { describeLocalTaskFailure, localTaskTitleForRef } from './local-task-failure-copy'
import { emptyLocalTasksPartition, type LocalTasksPartition } from './local-tasks-partition'

const TASK: LocalTask = {
  id: 't12',
  projectId: 'shop',
  number: 12,
  ref: 'SHOP-12',
  title: '',
  description: '',
  criteria: [],
  statusId: 'todo',
  priority: 0,
  labels: [],
  parentId: null,
  createdAt: 0,
  updatedAt: 0,
  revision: 1
}

const CODES: LocalTaskFailureCode[] = [
  'invalid_argument',
  'not_found',
  'stale',
  'read_only',
  'prefix_taken',
  'prefix_history_in_project',
  'prefix_invalid',
  'parent_invalid',
  'status_invalid',
  'status_in_use',
  'last_status_in_category',
  'comment_not_editable',
  'workspace_already_linked',
  'task_has_workspace',
  'workspace_required',
  'session_already_linked',
  'host_not_owned',
  'desktop_only',
  'attention_item_mismatch'
]

describe('describeLocalTaskFailure', () => {
  it('names the project that already owns a prefix', () => {
    expect(describeLocalTaskFailure({ ok: false, code: 'prefix_taken', detail: 'Mall' })).toContain(
      'Mall'
    )
  })

  it('tells every refusal apart', () => {
    const messages = CODES.map((code) => describeLocalTaskFailure({ ok: false, code }))
    expect(new Set(messages).size).toBe(CODES.length)
  })

  it('names the task a link refusal points at by the title the refusing library holds', () => {
    const library = (endpoint: LocalTaskEndpointKey, title: string): LocalTasksPartition => ({
      ...emptyLocalTasksPartition(endpoint),
      tasks: [{ ...TASK, title }]
    })
    const state = {
      tasks: [],
      partitions: [library('local', 'Order export'), library('runtime:env-1', 'Ship labels')]
    }
    const refusal = { ok: false, code: 'workspace_already_linked', detail: 'SHOP-12' } as const
    expect(
      describeLocalTaskFailure(refusal, (ref) => localTaskTitleForRef(state, 'runtime:env-1', ref))
    ).toBe('This workspace already belongs to “Ship labels”. Unlink it there first.')
    expect(
      describeLocalTaskFailure(
        { ok: false, code: 'session_already_linked', detail: 'SHOP-9' },
        (ref) => localTaskTitleForRef(state, 'local', ref)
      )
    ).toBe('This session is already linked to “SHOP-9”.')
  })

  it('keeps same-project historical prefixes distinct from another project and handles future codes', () => {
    const otherProject = describeLocalTaskFailure({
      ok: false,
      code: 'prefix_taken',
      detail: 'Mall'
    })
    const ownHistory = describeLocalTaskFailure({ ok: false, code: 'prefix_history_in_project' })
    expect(otherProject).toContain('Mall')
    expect(ownHistory).toContain('moved into this project')
    expect(ownHistory).not.toBe(otherProject)
    expect(describeLocalTaskFailure({ ok: false, code: 'future_code' })).toContain(
      'could not be saved'
    )
  })
})
