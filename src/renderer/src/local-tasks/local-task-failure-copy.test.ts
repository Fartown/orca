import { describe, expect, it } from 'vitest'
import type { LocalTaskFailureCode } from '../../../shared/local-tasks/local-task-types'
import { describeLocalTaskFailure } from './local-task-failure-copy'

const CODES: LocalTaskFailureCode[] = [
  'not_found',
  'stale',
  'read_only',
  'prefix_taken',
  'prefix_invalid',
  'orca_project_linked',
  'parent_invalid',
  'status_invalid',
  'status_in_use',
  'last_status_in_category',
  'comment_not_editable',
  'workspace_linked'
]

describe('describeLocalTaskFailure', () => {
  it('names the project that already owns a prefix or an Orca project', () => {
    expect(describeLocalTaskFailure({ ok: false, code: 'prefix_taken', detail: 'Mall' })).toContain(
      'Mall'
    )
    expect(
      describeLocalTaskFailure({ ok: false, code: 'orca_project_linked', detail: 'Shop' })
    ).toContain('Shop')
  })

  it('tells every refusal apart', () => {
    const messages = CODES.map((code) => describeLocalTaskFailure({ ok: false, code }))
    expect(new Set(messages).size).toBe(CODES.length)
  })
})
