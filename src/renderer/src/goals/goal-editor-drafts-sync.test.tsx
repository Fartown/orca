// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { goalRuntimeClient } from './goal-runtime-client'
import { useGoalEditorDraftSync } from './goal-editor-drafts-sync'

vi.mock('sonner', () => ({ toast: vi.fn() }))
vi.mock('./goal-runtime-client', () => ({ goalRuntimeClient: { listEditorDrafts: vi.fn() } }))
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})
it('notifies once when a fast generation finishes between polls, without replaying historical completions', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(10_000)
  const historical = {
    editorDraftId: 'old',
    generation: { draftId: 'old-attempt', status: 'ready', finishedAt: 100 }
  }
  vi.mocked(goalRuntimeClient.listEditorDrafts).mockResolvedValue({ items: [historical] } as never)
  renderHook(() => useGoalEditorDraftSync())
  await act(async () => {})
  expect(toast).not.toHaveBeenCalled()
  const fresh = {
    editorDraftId: 'new',
    generation: { draftId: 'fast-attempt', status: 'ready', finishedAt: 10_500 }
  }
  vi.mocked(goalRuntimeClient.listEditorDrafts).mockResolvedValue({
    items: [historical, fresh]
  } as never)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000)
  })
  expect(toast).toHaveBeenCalledTimes(1)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(4000)
  })
  expect(toast).toHaveBeenCalledTimes(1)
})
