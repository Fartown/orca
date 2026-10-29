import { describe, expect, it } from 'vitest'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import { initialLocalTaskDraft, localTaskOverwrite } from './local-task-form-state'

const base: LocalTask = {
  id: 't12',
  projectId: 'shop',
  number: 12,
  ref: 'SHOP-12',
  title: 'Order export',
  description: 'Export the current filter',
  criteria: ['UTF-8 BOM'],
  statusId: 'todo',
  priority: 3,
  labels: ['feature'],
  parentId: null,
  createdAt: 0,
  updatedAt: 0,
  revision: 4
}

describe('overwriting after another device changed the task', () => {
  it('sends only the fields this user edited, against the latest revision', () => {
    // The phone opened the form at revision 4 and retitled; the desktop meanwhile rewrote the
    // description and moved the task on to revision 6.
    const draft = {
      ...initialLocalTaskDraft({ kind: 'edit', task: base }),
      title: 'Order export CSV'
    }
    const latest = { ...base, description: 'Export with column picker', revision: 6 }
    expect(localTaskOverwrite(draft, base, latest)).toEqual({
      expectedRevision: 6,
      patch: { title: 'Order export CSV' }
    })
  })
})
