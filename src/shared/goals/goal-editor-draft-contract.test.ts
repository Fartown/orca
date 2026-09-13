import { expect, it } from 'vitest'
import {
  canApplyGeneratedDocument,
  goalDraftContext,
  type GoalEditorDraftContent
} from './goal-editor-draft-contract'

it('never applies a response from an older attempt to a newer generation with identical inputs', () => {
  const fields = { objective: '目标', judge: 'codex' as const, acceptanceDocument: '人工稿' }
  const content = {
    fields,
    target: { worktreeId: 'folder:one', paneKey: null },
    generation: {
      draftId: 'new-attempt',
      context: goalDraftContext(fields, 'folder:one'),
      baseDocument: '人工稿',
      applied: false
    }
  } as GoalEditorDraftContent
  expect(canApplyGeneratedDocument(content, 'old-attempt')).toBe(false)
  expect(canApplyGeneratedDocument(content, 'new-attempt')).toBe(true)
  expect(
    canApplyGeneratedDocument(
      { ...content, fields: { ...content.fields, acceptanceDocument: '后续人工修改' } },
      'new-attempt'
    )
  ).toBe(false)
})
