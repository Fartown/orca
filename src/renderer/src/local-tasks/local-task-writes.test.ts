import { describe, expect, it } from 'vitest'
import { parseSubtaskLines } from './local-task-writes'

describe('parseSubtaskLines (REQ-004 paste to add subtasks)', () => {
  it('turns each pasted line into one title, dropping list markers and blank lines', () => {
    const pasted = [
      '- Backend: export endpoint',
      '',
      '* [ ] Frontend: export button',
      '2) End-to-end check',
      '  • Release note  ',
      '[x] Already planned'
    ].join('\r\n')
    expect(parseSubtaskLines(pasted)).toEqual([
      'Backend: export endpoint',
      'Frontend: export button',
      'End-to-end check',
      'Release note',
      'Already planned'
    ])
  })
})
