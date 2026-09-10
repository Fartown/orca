// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { goalDomainStore } from '@/goals/goals-domain-store'
import { goalRuntimeClient } from '@/goals/goal-runtime-client'
import { GoalEditor } from './GoalEditor'

vi.mock('@/goals/goal-runtime-client', () => ({
  goalRuntimeClient: {
    draftAcceptance: vi.fn(),
    getAcceptanceDraft: vi.fn(),
    cancelAcceptanceDraft: vi.fn(async () => null),
    create: vi.fn()
  }
}))
vi.mock('@/goals/goal-session-target', () => ({
  resolveGoalBindingForPane: vi.fn(async () => ({
    ok: true,
    binding: { worktree: 'wt-1', terminal: 'term-1', expectedIncarnationId: 'inc-1' }
  }))
}))
vi.mock('@/goals/GoalDomainSyncGate', () => ({ requestGoalDetailRefresh: vi.fn() }))
vi.mock('./GoalTargetPicker', () => ({ GoalTargetPicker: () => null }))
const DOC = '# 验收文档\n\n按设计稿检查交互状态，并保存证据。'
beforeEach(() => {
  vi.clearAllMocks()
  act(() => goalDomainStore.getState().openEditor({ worktreeId: 'wt-1', paneKey: 'tab:leaf' }))
  vi.mocked(goalRuntimeClient.draftAcceptance).mockResolvedValue({
    draftId: 'draft',
    status: 'ready',
    objective: '目标',
    judge: 'codex',
    workspace: '/workspace',
    document: DOC,
    error: null
  })
  vi.mocked(goalRuntimeClient.create).mockResolvedValue({
    status: 'applied',
    goalId: null
  } as never)
})
afterEach(() => {
  cleanup()
  act(() => goalDomainStore.getState().closeEditor())
})
function startButton() {
  return screen.getByRole('button', { name: 'Start with this document' }) as HTMLButtonElement
}
function typeGoal(text = '目标') {
  fireEvent.change(screen.getByLabelText('Goal'), { target: { value: text } })
}
async function generate() {
  fireEvent.click(screen.getByRole('button', { name: 'Generate acceptance document' }))
  await waitFor(() =>
    expect((screen.getByLabelText('Acceptance document') as HTMLTextAreaElement).value).toBe(DOC)
  )
}

describe('Goal acceptance document workflow', () => {
  it('requires a document, shows a guard before advanced settings, and has no acknowledgement checkbox', () => {
    render(<GoalEditor />)
    typeGoal()
    expect(startButton().disabled).toBe(true)
    expect(screen.getByLabelText('Guard').textContent).toContain('Codex')
    expect(screen.queryByText(/No check command and no judge/)).toBeNull()
    expect(goalRuntimeClient.create).not.toHaveBeenCalled()
  })
  it('generates without starting and starts with the exact edited document', async () => {
    render(<GoalEditor />)
    typeGoal()
    await generate()
    expect(goalRuntimeClient.create).not.toHaveBeenCalled()
    const edited = `    保留 Markdown 缩进。\n\n${DOC}\n\n增加键盘验收。\n`
    fireEvent.change(screen.getByLabelText('Acceptance document'), { target: { value: edited } })
    fireEvent.click(startButton())
    await waitFor(() =>
      expect(goalRuntimeClient.create).toHaveBeenCalledWith(
        expect.objectContaining({
          spec: expect.objectContaining({
            acceptanceDocument: edited,
            acceptanceText: edited,
            judge: 'codex'
          })
        })
      )
    )
  })
  it('requires review again after the goal changes', async () => {
    render(<GoalEditor />)
    typeGoal()
    await generate()
    typeGoal('改后的目标')
    expect(startButton().disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'I reviewed the updated context' }))
    expect(startButton().disabled).toBe(false)
  })
  it('preserves the goal and document when regeneration fails', async () => {
    render(<GoalEditor />)
    typeGoal()
    await generate()
    vi.mocked(goalRuntimeClient.draftAcceptance).mockRejectedValueOnce(
      new Error('Guard not signed in')
    )
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate document' }))
    await screen.findByText('Guard not signed in')
    expect((screen.getByLabelText('Acceptance document') as HTMLTextAreaElement).value).toBe(DOC)
    expect((screen.getByLabelText('Goal') as HTMLTextAreaElement).value).toBe('目标')
  })
  it('blocks starting during generation and cancels without accepting late output', async () => {
    let acknowledgeCancel!: () => void
    vi.mocked(goalRuntimeClient.cancelAcceptanceDraft).mockImplementationOnce(
      () =>
        new Promise((r) => {
          acknowledgeCancel = () => r(null)
        })
    )
    let resolve!: (value: Awaited<ReturnType<typeof goalRuntimeClient.draftAcceptance>>) => void
    vi.mocked(goalRuntimeClient.draftAcceptance).mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r
        })
    )
    render(<GoalEditor />)
    typeGoal()
    fireEvent.click(screen.getByRole('button', { name: 'Generate acceptance document' }))
    await waitFor(() => expect(goalRuntimeClient.draftAcceptance).toHaveBeenCalled())
    expect(startButton().disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel generation' }))
    await waitFor(() => expect(goalRuntimeClient.cancelAcceptanceDraft).toHaveBeenCalled())
    await act(async () =>
      resolve({
        draftId: 'draft',
        status: 'ready',
        objective: '目标',
        judge: 'codex',
        workspace: '/workspace',
        document: DOC,
        error: null
      })
    )
    expect((screen.getByLabelText('Acceptance document') as HTMLTextAreaElement).value).toBe('')
    expect(goalRuntimeClient.create).not.toHaveBeenCalled()
    await act(async () => acknowledgeCancel())
  })
  it('ignores a generation that finishes after the goal was changed', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof goalRuntimeClient.draftAcceptance>>) => void
    vi.mocked(goalRuntimeClient.draftAcceptance).mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r
        })
    )
    render(<GoalEditor />)
    typeGoal()
    fireEvent.click(screen.getByRole('button', { name: 'Generate acceptance document' }))
    await waitFor(() => expect(goalRuntimeClient.draftAcceptance).toHaveBeenCalled())
    typeGoal('新目标')
    await act(async () =>
      resolve({
        draftId: 'draft',
        status: 'ready',
        objective: '旧目标',
        judge: 'codex',
        workspace: '/workspace',
        document: DOC,
        error: null
      })
    )
    expect((screen.getByLabelText('Acceptance document') as HTMLTextAreaElement).value).toBe('')
    expect(startButton().disabled).toBe(true)
  })
})
