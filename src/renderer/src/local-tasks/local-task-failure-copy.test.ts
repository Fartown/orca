import { describe, expect, it } from 'vitest'
import type { LocalTaskFailureCode } from '../../../shared/local-tasks/local-task-types'
import { describeLocalTaskFailure } from './local-task-failure-copy'

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
