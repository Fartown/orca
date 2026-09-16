// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { TooltipProvider } from '@/components/ui/tooltip'
import { goalEditorDraftsStore } from '@/goals/goal-editor-drafts-sync'
import { goalDomainStore } from '@/goals/goals-domain-store'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { GoalDraftList } from './GoalDraftList'

vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: vi.fn() }))
vi.mock('@/goals/GoalDomainSyncGate', () => ({ requestGoalDetailRefresh: vi.fn() }))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
const rpc = vi.mocked(callRuntimeRpc)
let id: string
beforeEach(() => {
  vi.clearAllMocks()
  id = randomUUID()
  goalDomainStore.getState().setRoute('local')
  goalEditorDraftsStore.setState({
    routeExecutionHostId: 'local',
    deletedIds: new Set(),
    error: null,
    items: [
      {
        editorDraftId: id,
        objectivePreview: '',
        worktreeId: 'folder:test',
        goalId: null,
        updatedAt: 1,
        hasDocument: false,
        generation: null
      }
    ]
  })
  rpc.mockResolvedValue(null)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
function show() {
  render(
    <TooltipProvider>
      <GoalDraftList />
    </TooltipProvider>
  )
}
function open() {
  fireEvent.click(screen.getByRole('button', { name: 'Delete draft' }))
}
function confirm() {
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /delete/i }))
}

it('exposes deletion without opening the editor, and cancel leaves an untitled draft intact', () => {
  show()
  open()
  expect(screen.getByRole('dialog').textContent).toContain('Untitled goal draft')
  expect(goalDomainStore.getState().editor.open).toBe(false)
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(goalEditorDraftsStore.getState().items).toHaveLength(1)
  expect(rpc).not.toHaveBeenCalled()
})

it('removes only the confirmed row after the host acknowledges deletion', async () => {
  rpc.mockImplementation(async (_target, method) =>
    method === 'goals.deleteEditorDraft' ? { status: 'deleted' } : null
  )
  show()
  open()
  confirm()
  await waitFor(() => expect(goalEditorDraftsStore.getState().items).toHaveLength(0))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(rpc).toHaveBeenCalledWith({ kind: 'local' }, 'goals.deleteEditorDraft', {
    editorDraftId: id,
    expectedRevision: 0,
    authorityExecutionHostId: 'local'
  })
})

it('keeps errors visible and retries without losing the draft', async () => {
  let failed = true
  rpc.mockImplementation(async (_target, method) => {
    if (method === 'goals.deleteEditorDraft') {
      if (failed) {
        throw new Error('Connection dropped')
      }
      return { status: 'deleted' }
    }
    return null
  })
  show()
  open()
  confirm()
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Connection dropped'))
  expect(goalEditorDraftsStore.getState().items).toHaveLength(1)
  failed = false
  confirm()
  await waitFor(() => expect(goalEditorDraftsStore.getState().items).toHaveLength(0))
})

it('shows stop progress, disables duplicate confirmation and retains unverifiable work', async () => {
  vi.useFakeTimers()
  const state = goalEditorDraftsStore.getState()
  goalEditorDraftsStore.setState({
    items: state.items.map((item) => ({
      ...item,
      generation: {
        draftId: randomUUID(),
        status: 'generating',
        objective: 'test',
        judge: 'codex',
        workspace: '/test',
        error: null,
        startedAt: 1
      }
    }))
  })
  rpc
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ status: 'stopping' })
    .mockResolvedValueOnce({ status: 'unverifiable' })
  show()
  fireEvent.click(screen.getByRole('button', { name: 'Stop generation and delete' }))
  confirm()
  await act(async () => {})
  expect(screen.getByRole('status').textContent).toBe('Stopping generation…')
  expect(
    within(screen.getByRole('dialog'))
      .getByRole('button', { name: 'Stop generation and delete' })
      .hasAttribute('disabled')
  ).toBe(true)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })
  expect(screen.getByRole('alert').textContent).toContain('Cannot confirm')
  expect(goalEditorDraftsStore.getState().items).toHaveLength(1)
})

it('pins deletion to the displayed SSH host across a route change and preserves another hosts row', async () => {
  goalDomainStore.getState().setRoute('ssh:one')
  goalEditorDraftsStore.setState({ routeExecutionHostId: 'ssh:one' })
  let acknowledge: ((value: unknown) => void) | undefined
  rpc.mockImplementation(async (_target, method) =>
    method === 'goals.deleteEditorDraft'
      ? new Promise((resolve) => {
          acknowledge = resolve
        })
      : null
  )
  show()
  open()
  confirm()
  await waitFor(() => expect(acknowledge).toBeDefined())
  await act(async () => {
    goalDomainStore.getState().setRoute('local')
    goalEditorDraftsStore.setState({ routeExecutionHostId: 'local' })
    acknowledge?.({ status: 'deleted' })
  })
  expect(goalEditorDraftsStore.getState().items).toHaveLength(1)
  expect(rpc).toHaveBeenCalledWith({ kind: 'local' }, 'goals.deleteEditorDraft', {
    editorDraftId: id,
    expectedRevision: 0,
    authorityExecutionHostId: 'ssh:one'
  })
})

it('ends a prolonged stop wait with retryable feedback and keeps the row', async () => {
  vi.useFakeTimers()
  rpc.mockImplementation(async (_target, method) =>
    method === 'goals.deleteEditorDraft' ? { status: 'stopping' } : null
  )
  show()
  open()
  confirm()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20_000)
  })
  expect(screen.getByRole('alert').textContent).toContain('still stopping')
  expect(goalEditorDraftsStore.getState().items).toHaveLength(1)
  expect(
    within(screen.getByRole('dialog'))
      .getByRole('button', { name: 'Delete draft' })
      .hasAttribute('disabled')
  ).toBe(false)
})
