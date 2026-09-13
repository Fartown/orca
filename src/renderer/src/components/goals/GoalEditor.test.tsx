// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { goalDomainStore } from '@/goals/goals-domain-store'
import { goalRuntimeClient } from '@/goals/goal-runtime-client'
import { openGoalDocument } from '@/goals/open-goal-document'
import type { GoalEditorDraftRecord } from '../../../../shared/goals/goal-editor-draft-contract'
import type { GoalAcceptanceDraft } from '../../../../shared/goals/goal-acceptance-draft-contract'
import { GoalEditor } from './GoalEditor'

vi.mock('@/goals/goal-runtime-client', () => ({
  goalRuntimeClient: {
    draftAcceptance: vi.fn(),
    getAcceptanceDraft: vi.fn(),
    cancelAcceptanceDraft: vi.fn(),
    saveEditorDraft: vi.fn(),
    getEditorDraft: vi.fn(),
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
vi.mock('@/goals/open-goal-document', () => ({ openGoalDocument: vi.fn() }))
const DOC = '# 验收文档\n\n按设计稿检查交互状态，并保存证据。'
let records: Map<string, GoalEditorDraftRecord>
let results: Map<string, GoalAcceptanceDraft>
let mode: 'ready' | 'generating' | 'failed'
let filePaths: boolean
beforeEach(() => {
  vi.clearAllMocks()
  records = new Map()
  results = new Map()
  mode = 'ready'
  filePaths = false
  vi.mocked(openGoalDocument).mockResolvedValue(undefined)
  vi.mocked(goalRuntimeClient.saveEditorDraft).mockImplementation(async (input) => {
    const record = {
      ...input.content,
      editorDraftId: input.editorDraftId,
      revision: input.expectedRevision + 1,
      createdAt: 1,
      updatedAt: Date.now(),
      documentPath:
        filePaths && input.content.fields.acceptanceDocument
          ? `/draft/acceptance-${input.expectedRevision + 1}.md`
          : undefined
    }
    records.set(record.editorDraftId, record)
    return record
  })
  vi.mocked(goalRuntimeClient.getEditorDraft).mockImplementation(
    async (id) => records.get(id) ?? null
  )
  vi.mocked(goalRuntimeClient.getAcceptanceDraft).mockImplementation(
    async (id) => results.get(id) ?? null
  )
  vi.mocked(goalRuntimeClient.draftAcceptance).mockImplementation(async (input) => {
    const result: GoalAcceptanceDraft = {
      draftId: input.draftId,
      status: mode,
      objective: input.objective,
      judge: input.judge,
      workspace: '/workspace',
      document: mode === 'ready' ? DOC : null,
      documentPath: filePaths && mode === 'ready' ? '/generated/acceptance.md' : undefined,
      error: mode === 'failed' ? 'Guard not signed in' : null,
      startedAt: Date.now()
    }
    results.set(input.draftId, result)
    return result
  })
  vi.mocked(goalRuntimeClient.cancelAcceptanceDraft).mockImplementation(async (id) => {
    const result = { ...results.get(id)!, status: 'cancelled' as const, document: null }
    results.set(id, result)
    return result
  })
  vi.mocked(goalRuntimeClient.create).mockResolvedValue({
    status: 'applied',
    goalId: null
  } as never)
  act(() => goalDomainStore.getState().openEditor({ worktreeId: 'wt-1', paneKey: 'tab:leaf' }))
})
afterEach(() => {
  cleanup()
  act(() => goalDomainStore.getState().closeEditor())
})
const objective = () => screen.getByLabelText('Goal') as HTMLTextAreaElement
const document = () => screen.getByLabelText('Acceptance document') as HTMLTextAreaElement
const start = () =>
  screen.getByRole('button', { name: 'Start with this document' }) as HTMLButtonElement
async function open() {
  render(<GoalEditor />)
  await waitFor(() => expect(objective().closest('fieldset')?.disabled).toBe(false))
  fireEvent.change(objective(), { target: { value: '目标' } })
}
async function generate(label = 'Generate acceptance document') {
  fireEvent.click(screen.getByRole('button', { name: label }))
  await waitFor(() => expect(goalRuntimeClient.draftAcceptance).toHaveBeenCalled())
  if (mode === 'ready') {
    await waitFor(() => expect(document().value).toBe(DOC), { timeout: 2500 })
  }
}
function complete() {
  const [id, previous] = [...results.entries()].at(-1)!
  results.set(id, {
    ...previous,
    status: 'ready',
    document: DOC,
    documentPath: filePaths ? '/generated/acceptance.md' : undefined
  })
}
async function reopen() {
  const record = [...records.values()].at(-1)!
  act(() =>
    goalDomainStore
      .getState()
      .openEditor({ worktreeId: 'wt-1', paneKey: null, draftId: record.editorDraftId })
  )
  await waitFor(() => expect(objective().closest('fieldset')?.disabled).toBe(false))
}

describe('persistent Goal editor', () => {
  it('shows a saved file path and opens the existing Markdown tab after saving edits', async () => {
    filePaths = true
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Generate acceptance document' }))
    await screen.findByRole('button', { name: 'Open Markdown tab' })
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'Acceptance document' })).toBeNull()
    )
    fireEvent.click(screen.getByRole('button', { name: 'Edit document' }))
    fireEvent.change(document(), { target: { value: ' 新人工稿\n' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open Markdown tab' }))
    await waitFor(() => expect(openGoalDocument).toHaveBeenCalledTimes(1))
    const saved = [...records.values()].at(-1)!
    expect(saved.fields.acceptanceDocument).toBe(' 新人工稿\n')
    expect(openGoalDocument).toHaveBeenCalledWith(saved.documentPath, 'wt-1')
    expect(goalDomainStore.getState().editor.open).toBe(false)
    expect(goalRuntimeClient.cancelAcceptanceDraft).not.toHaveBeenCalled()
    await reopen()
    await screen.findByRole('button', { name: saved.documentPath })
    expect(goalRuntimeClient.create).not.toHaveBeenCalled()
  })
  it('opens a candidate file without adopting it and preserves the draft on open failure', async () => {
    filePaths = true
    mode = 'generating'
    await open()
    fireEvent.change(document(), { target: { value: '原文保留' } })
    await screen.findByRole('button', { name: 'Open Markdown tab' })
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate document' }))
    await waitFor(() => expect(goalRuntimeClient.draftAcceptance).toHaveBeenCalled())
    fireEvent.change(objective(), { target: { value: '修改后的目标' } })
    complete()
    const candidatePath = await screen.findByRole('button', { name: '/generated/acceptance.md' })
    vi.mocked(openGoalDocument).mockRejectedValueOnce(new Error('File open failed'))
    fireEvent.click(candidatePath)
    await screen.findByText('File open failed')
    expect(goalDomainStore.getState().editor.open).toBe(true)
    expect([...records.values()].at(-1)!.fields.acceptanceDocument).toBe('原文保留')
    fireEvent.click(candidatePath)
    await waitFor(() => expect(goalDomainStore.getState().editor.open).toBe(false))
    expect(openGoalDocument).toHaveBeenLastCalledWith('/generated/acceptance.md', 'wt-1')
    expect([...records.values()].at(-1)!.generation?.applied).toBe(false)
    expect(goalRuntimeClient.create).not.toHaveBeenCalled()
  })
  it('requires a document and starts with the exact edited Markdown, then archives the draft', async () => {
    await open()
    expect(start().disabled).toBe(true)
    await generate()
    expect(goalRuntimeClient.create).not.toHaveBeenCalled()
    const edited = `    保留 Markdown 缩进。\n\n${DOC}\n\n增加键盘验收。\n`
    fireEvent.change(document(), { target: { value: edited } })
    fireEvent.click(start())
    await waitFor(() =>
      expect(goalRuntimeClient.create).toHaveBeenCalledWith(
        expect.objectContaining({
          spec: expect.objectContaining({ acceptanceDocument: edited, acceptanceText: edited })
        })
      )
    )
    await waitFor(() => expect([...records.values()].at(-1)?.archived).toBe(true))
  })
  it('continues after closing, restores the same attempt, and saves a background result for review', async () => {
    mode = 'generating'
    await open()
    await generate()
    expect(start().disabled).toBe(true)
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0])
    await waitFor(() => expect(goalDomainStore.getState().editor.open).toBe(false))
    expect(goalRuntimeClient.cancelAcceptanceDraft).not.toHaveBeenCalled()
    await reopen()
    await screen.findByRole('button', { name: 'Stop generation' })
    expect(goalRuntimeClient.draftAcceptance).toHaveBeenCalledTimes(1)
    complete()
    await waitFor(() => expect(document().value).toBe(DOC), { timeout: 2500 })
    expect(goalRuntimeClient.create).not.toHaveBeenCalled()
  })
  it('preserves manual edits made during generation and requires explicit adoption of the late candidate', async () => {
    mode = 'generating'
    await open()
    await generate()
    fireEvent.change(document(), { target: { value: '我的人工验收稿' } })
    complete()
    const adopt = await screen.findByRole(
      'button',
      { name: 'Adopt generated document' },
      { timeout: 2500 }
    )
    expect(document().value).toBe('我的人工验收稿')
    expect(start().disabled).toBe(true)
    fireEvent.click(adopt)
    await waitFor(() => expect(document().value).toBe(DOC))
  })
  it('keeps a late result as a candidate after the objective changes and requires context review', async () => {
    mode = 'generating'
    await open()
    await generate()
    fireEvent.change(objective(), { target: { value: '新目标' } })
    complete()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Adopt generated document' }, { timeout: 2500 })
    )
    expect(start().disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'I reviewed the updated context' }))
    expect(start().disabled).toBe(false)
    expect(goalRuntimeClient.cancelAcceptanceDraft).not.toHaveBeenCalled()
  })
  it('retains the previous document on failure and retries with a new attempt', async () => {
    await open()
    await generate()
    mode = 'failed'
    await generate('Regenerate document')
    await screen.findByText('Guard not signed in', {}, { timeout: 2500 })
    expect(document().value).toBe(DOC)
    mode = 'ready'
    await generate('Regenerate document')
    await waitFor(() => expect(goalRuntimeClient.draftAcceptance).toHaveBeenCalledTimes(3))
    expect(
      new Set(vi.mocked(goalRuntimeClient.draftAcceptance).mock.calls.map(([p]) => p.draftId)).size
    ).toBe(3)
  })
  it('requests cancellation only from the explicit stop button', async () => {
    mode = 'generating'
    await open()
    await generate()
    fireEvent.click(await screen.findByRole('button', { name: 'Stop generation' }))
    await screen.findByText('Generation stopped')
    expect(document().value).toBe('')
    expect(goalRuntimeClient.cancelAcceptanceDraft).toHaveBeenCalledTimes(1)
  })
  it('keeps polling through a connection failure without cancelling the task', async () => {
    mode = 'generating'
    await open()
    await generate()
    vi.mocked(goalRuntimeClient.getAcceptanceDraft).mockRejectedValueOnce(
      new Error('temporary connection loss')
    )
    await screen.findByText('temporary connection loss', {}, { timeout: 2500 })
    expect(goalRuntimeClient.cancelAcceptanceDraft).not.toHaveBeenCalled()
    complete()
    await waitFor(() => expect(document().value).toBe(DOC), { timeout: 2500 })
  })
  it('restores an edited document after the entire editor unmounts', async () => {
    await open()
    await generate()
    fireEvent.change(document(), { target: { value: '保存人工编辑\n' } })
    await waitFor(() =>
      expect([...records.values()].at(-1)?.fields.acceptanceDocument).toBe('保存人工编辑\n')
    )
    const draftId = [...records.keys()].at(-1)!
    cleanup()
    act(() => goalDomainStore.getState().closeEditor())
    render(<GoalEditor />)
    act(() => goalDomainStore.getState().openEditor({ worktreeId: 'wt-1', paneKey: null, draftId }))
    await waitFor(() => expect(objective().closest('fieldset')?.disabled).toBe(false))
    expect(document().value).toBe('保存人工编辑\n')
    expect(goalRuntimeClient.cancelAcceptanceDraft).not.toHaveBeenCalled()
  })
})
