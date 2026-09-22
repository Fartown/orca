import { afterEach, expect, it, vi } from 'vitest'
import { GoalRpcParams } from '../../../shared/goals/goal-control-contract'
import type { GoalEditorDraftRecord } from '../../../shared/goals/goal-editor-draft-contract'
import { callRuntimeRpc } from '../runtime/runtime-rpc-client'
import { openGoalDraftSession, forgetGoalDraftSession } from './goal-editor-draft-session'
import { GoalRuntimeClient } from './goal-runtime-client'
import { goalDomainStore } from './goals-domain-store'

vi.mock('../runtime/runtime-rpc-client', () => ({ callRuntimeRpc: vi.fn() }))
afterEach(() => vi.clearAllMocks())
function record(): GoalEditorDraftRecord {
  return {
    editorDraftId: 'ed000000-0000-4000-8000-000000000001',
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    fields: {
      objective: 'host-owned',
      criteria: [],
      acceptanceDocument: '',
      acceptanceText: '',
      extraChecks: '',
      checkAll: true,
      onBlocked: 'ask',
      judge: 'codex',
      maxTurns: '0',
      maxMinutes: '0',
      checkTimeoutSeconds: '60'
    },
    target: { worktreeId: 'same-workspace', paneKey: null },
    goalId: null,
    documentContext: null,
    generation: null,
    operationId: 'ed000000-0000-4000-8000-000000000002',
    archived: false
  }
}

it('isolates identical draft IDs and pins delayed saves when the selected host changes', async () => {
  const calls: string[] = []
  vi.mocked(callRuntimeRpc).mockImplementation(async (_target, method, raw) => {
    expect(method).toBe('goals.saveEditorDraft')
    const params = GoalRpcParams['goals.saveEditorDraft'].parse(raw)
    calls.push(params.authorityExecutionHostId)
    await Promise.resolve()
    return {
      ...params.content,
      editorDraftId: params.editorDraftId,
      revision: params.expectedRevision + 1,
      createdAt: 1,
      updatedAt: 2
    }
  })
  const one = await openGoalDraftSession(record(), new GoalRuntimeClient('ssh:one'))
  const two = await openGoalDraftSession(record(), new GoalRuntimeClient('ssh:two'))
  expect(one).not.toBe(two)
  one.change((content) => ({ ...content, fields: { ...content.fields, objective: 'only on one' } }))
  goalDomainStore.getState().setRoute('ssh:two')
  await one.flush()
  expect(calls).toEqual(['ssh:one'])
  expect(two.getSnapshot().content.fields.objective).toBe('host-owned')
})

it('invalidates a deleted editor cache without affecting the same ID on another host', async () => {
  const client = new GoalRuntimeClient('ssh:delete-one')
  const other = new GoalRuntimeClient('ssh:delete-two')
  const one = await openGoalDraftSession(record(), client)
  const two = await openGoalDraftSession(record(), other)
  forgetGoalDraftSession(one.id, client)
  one.change((content) => ({ ...content, fields: { ...content.fields, objective: 'late result' } }))
  expect(one.getSnapshot().content.fields.objective).toBe('host-owned')
  await expect(one.flush()).rejects.toThrow('deleted')
  vi.mocked(callRuntimeRpc).mockResolvedValue(null)
  await expect(openGoalDraftSession(one.id, client)).rejects.toThrow('could not be found')
  expect(await openGoalDraftSession(two.id, other)).toBe(two)
})

it('coalesces a burst of edits into one save, and flush still writes immediately', async () => {
  const saved: string[] = []
  vi.mocked(callRuntimeRpc).mockImplementation(async (_target, _method, raw) => {
    const params = GoalRpcParams['goals.saveEditorDraft'].parse(raw)
    saved.push(params.content.fields.objective)
    return {
      ...params.content,
      editorDraftId: params.editorDraftId,
      revision: params.expectedRevision + 1,
      createdAt: 1,
      updatedAt: 2
    }
  })
  const session = await openGoalDraftSession(record(), new GoalRuntimeClient('ssh:debounce'))
  session.change((content) => ({ ...content, fields: { ...content.fields, objective: 'a' } }))
  session.change((content) => ({ ...content, fields: { ...content.fields, objective: 'b' } }))
  // Why asserted before waiting: typing must not reach the host per keystroke, because each save
  // rewrites the draft's document on the execution host.
  expect(saved).toEqual([])
  await session.flush()
  expect(saved).toEqual(['b'])
})
