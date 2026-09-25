// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { goalRuntimeClient } from './goal-runtime-client'
import {
  useGoalEditorDraftSync,
  removeDeletedGoalDraft,
  requestGoalEditorDraftsRefresh,
  goalEditorDraftsStore
} from './goal-editor-drafts-sync'
import type { GoalEditorDraftSummary } from '../../../shared/goals/goal-editor-draft-contract'

vi.mock('sonner', () => ({ toast: vi.fn() }))
vi.mock('./goal-runtime-client', () => ({
  goalRuntimeClient: { routeExecutionHostId: 'local', listEditorDrafts: vi.fn() }
}))
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

it('does not resurrect a deleted row or notify from a list response already in flight', async () => {
  const item: GoalEditorDraftSummary = {
    editorDraftId: 'deleted',
    objectivePreview: '',
    worktreeId: null,
    goalId: null,
    updatedAt: 1,
    hasDocument: false,
    generation: null
  }
  let resolveList: ((result: { items: GoalEditorDraftSummary[] }) => void) | undefined
  vi.mocked(goalRuntimeClient.listEditorDrafts).mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveList = resolve
      })
  )
  renderHook(() => useGoalEditorDraftSync())
  await act(async () => {
    removeDeletedGoalDraft(item.editorDraftId, goalRuntimeClient)
    resolveList?.({ items: [item] })
  })
  expect(goalEditorDraftsStore.getState().items).toEqual([])
  expect(toast).not.toHaveBeenCalled()
})

const ATTEMPT_ID = '00000000-0000-4000-8000-000000000001'

function draft(id: string, status: 'generating' | 'ready' | null): GoalEditorDraftSummary {
  return {
    editorDraftId: id,
    objectivePreview: '',
    worktreeId: null,
    goalId: null,
    updatedAt: 1,
    hasDocument: false,
    generation: status
      ? {
          draftId: ATTEMPT_ID,
          status,
          objective: '',
          judge: 'codex',
          workspace: '/w',
          error: null,
          finishedAt: 20_000
        }
      : null
  }
}

it('reads once with the panel closed, and keeps polling only while a generation runs', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(10_000)
  const list = vi.mocked(goalRuntimeClient.listEditorDrafts)
  list.mockResolvedValue({ items: [draft('idle', null)] })
  renderHook(() =>
    useGoalEditorDraftSync(goalRuntimeClient, { inContact: true, panelVisible: false })
  )
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000)
  })
  expect(list).toHaveBeenCalledTimes(1)

  list.mockResolvedValue({ items: [draft('running', 'generating')] })
  await act(async () => {
    requestGoalEditorDraftsRefresh()
    await vi.advanceTimersByTimeAsync(0)
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(4_000)
  })
  const whileRunning = list.mock.calls.length
  expect(whileRunning).toBeGreaterThanOrEqual(3)

  list.mockResolvedValue({ items: [draft('running', 'ready')] })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2_000)
  })
  expect(toast).toHaveBeenCalledTimes(1)
  const afterFinish = list.mock.calls.length
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000)
  })
  // One read may land as polling winds down; no steady polling remains.
  expect(list.mock.calls.length - afterFinish).toBeLessThanOrEqual(1)
})

it('never reads drafts on a host out of contact', async () => {
  vi.useFakeTimers()
  const list = vi.mocked(goalRuntimeClient.listEditorDrafts)
  list.mockResolvedValue({ items: [draft('running', 'generating')] })
  renderHook(() =>
    useGoalEditorDraftSync(goalRuntimeClient, { inContact: false, panelVisible: true })
  )
  await act(async () => {
    requestGoalEditorDraftsRefresh()
    await vi.advanceTimersByTimeAsync(10_000)
  })
  expect(list).not.toHaveBeenCalled()
})
