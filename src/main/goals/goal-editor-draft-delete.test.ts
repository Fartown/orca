import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { GoalEditorDraftContent } from '../../shared/goals/goal-editor-draft-contract'
import type { GoalAcceptanceDraft } from '../../shared/goals/goal-acceptance-draft-contract'
import { GoalEditorDraftStore } from './goal-editor-draft-store'
import { GoalAcceptanceDrafts } from './goal-acceptance-drafts'

let home: string
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'goal-delete-'))
})
afterEach(async () => {
  await rm(home, { recursive: true, force: true })
})
const content: GoalEditorDraftContent = {
  fields: {
    objective: '',
    criteria: [],
    acceptanceDocument: '# document',
    acceptanceText: '',
    extraChecks: '',
    checkAll: false,
    onBlocked: 'ask',
    judge: 'codex',
    maxTurns: '',
    maxMinutes: '',
    checkTimeoutSeconds: '900'
  },
  target: { worktreeId: 'folder:test', paneKey: null },
  goalId: null,
  documentContext: null,
  generation: null,
  operationId: randomUUID(),
  archived: false
}
const generation = {
  draftId: randomUUID(),
  context: 'context',
  baseDocument: '',
  requestedAt: 1,
  applied: false
}
const result: GoalAcceptanceDraft = {
  draftId: generation.draftId,
  status: 'generating',
  objective: 'generate',
  judge: 'codex',
  workspace: '/test',
  document: null,
  error: null,
  startedAt: 1
}
function setup() {
  const cancel = vi.fn<GoalAcceptanceDrafts['cancel']>().mockResolvedValue(null)
  const get = vi.fn<GoalAcceptanceDrafts['get']>().mockResolvedValue(null)
  return { store: new GoalEditorDraftStore(home, { cancel, get }), cancel, get }
}

it('deletes persistently, preserves Markdown and rejects a delayed save after a lost delete response', async () => {
  const { store, cancel, get } = setup()
  const id = randomUUID()
  const saved = await store.save({ editorDraftId: id, expectedRevision: 0, content })
  expect(await store.delete({ editorDraftId: id, expectedRevision: 1 })).toEqual({
    status: 'deleted'
  })
  const restarted = new GoalEditorDraftStore(home, { cancel, get })
  expect(await restarted.get(id)).toBeNull()
  expect(await restarted.list()).toEqual({ items: [] })
  expect(await readFile(saved.documentPath!, 'utf8')).toBe('# document')
  await expect(restarted.save({ editorDraftId: id, expectedRevision: 1, content })).rejects.toThrow(
    'deleted'
  )
  expect(await restarted.delete({ editorDraftId: id, expectedRevision: 1 })).toEqual({
    status: 'deleted'
  })
  expect(cancel).not.toHaveBeenCalled()
})

it('serializes deletion with writes and refuses to delete a concurrently edited revision', async () => {
  const { store } = setup()
  const id = randomUUID()
  await store.save({ editorDraftId: id, expectedRevision: 0, content })
  const save = store.save({
    editorDraftId: id,
    expectedRevision: 1,
    content: { ...content, archived: true }
  })
  await expect(store.delete({ editorDraftId: id, expectedRevision: 1 })).rejects.toThrow(
    'another editor'
  )
  await save
  expect((await store.get(id))?.revision).toBe(2)
})

it.each(['stopping', 'unverifiable'] as const)(
  'keeps a %s generation visible until its host confirms completion',
  async (phase) => {
    const { store, cancel, get } = setup()
    cancel.mockResolvedValue({ ...result, phase })
    get.mockResolvedValue({ ...result, phase })
    const id = randomUUID()
    await store.save({
      editorDraftId: id,
      expectedRevision: 0,
      content: { ...content, generation }
    })
    expect(await store.delete({ editorDraftId: id, expectedRevision: 1 })).toEqual({
      status: phase
    })
    expect((await store.list()).items).toHaveLength(1)
    cancel.mockResolvedValue({ ...result, status: 'cancelled' })
    expect(await store.delete({ editorDraftId: id, expectedRevision: 1 })).toEqual({
      status: 'deleted'
    })
    expect(await store.get(id)).toBeNull()
  }
)

it('keeps the draft when stopping fails, then allows retry', async () => {
  const { store, cancel } = setup()
  cancel.mockRejectedValueOnce(new Error('host unavailable'))
  const id = randomUUID()
  await store.save({ editorDraftId: id, expectedRevision: 0, content: { ...content, generation } })
  await expect(store.delete({ editorDraftId: id, expectedRevision: 1 })).rejects.toThrow(
    'host unavailable'
  )
  expect(await store.get(id)).not.toBeNull()
  cancel.mockResolvedValue({ ...result, status: 'ready' })
  expect(await store.delete({ editorDraftId: id, expectedRevision: 1 })).toEqual({
    status: 'deleted'
  })
})

it('leaves the same draft ID on another execution host untouched', async () => {
  const { store, cancel, get } = setup()
  const other = new GoalEditorDraftStore(join(home, 'other-host'), { cancel, get })
  const id = randomUUID()
  await Promise.all(
    [store, other].map((target) => target.save({ editorDraftId: id, expectedRevision: 0, content }))
  )
  await store.delete({ editorDraftId: id, expectedRevision: 1 })
  expect(await store.get(id)).toBeNull()
  expect(await other.get(id)).not.toBeNull()
})

it('waits for the provider termination barrier before deleting its editor draft', async () => {
  const run = vi.fn<NonNullable<ConstructorParameters<typeof GoalAcceptanceDrafts>[0]['run']>>(
    async (spec) => {
      await new Promise<void>((resolve) =>
        spec.signal?.addEventListener('abort', () => resolve(), { once: true })
      )
      return { code: 0, stdout: '', stderr: '', signal: null, timedOut: false }
    }
  )
  const drafts = new GoalAcceptanceDrafts({
    goalHome: home,
    entryPath: '/fixture/goal-driver.js',
    admission: { validate: vi.fn() },
    resolveWorkspace: async () => home,
    run
  })
  const store = new GoalEditorDraftStore(home, drafts)
  const id = randomUUID()
  await store.save({ editorDraftId: id, expectedRevision: 0, content: { ...content, generation } })
  await drafts.start({
    authorityExecutionHostId: 'local',
    draftId: generation.draftId,
    worktree: 'folder:test',
    objective: 'generate',
    judge: 'codex'
  })
  await vi.waitFor(() => expect(run).toHaveBeenCalledOnce())
  expect(await store.delete({ editorDraftId: id, expectedRevision: 1 })).toEqual({
    status: 'deleted'
  })
  expect((await drafts.get(generation.draftId))?.status).toBe('cancelled')
  expect(await store.get(id)).toBeNull()
})

it('prevents a delayed generation start from launching after deletion', async () => {
  let resolveWorkspace: ((path: string) => void) | undefined
  const run = vi.fn<NonNullable<ConstructorParameters<typeof GoalAcceptanceDrafts>[0]['run']>>()
  const drafts = new GoalAcceptanceDrafts({
    goalHome: home,
    entryPath: '/fixture/goal-driver.js',
    admission: { validate: vi.fn() },
    resolveWorkspace: () =>
      new Promise((resolve) => {
        resolveWorkspace = resolve
      }),
    run
  })
  const store = new GoalEditorDraftStore(home, drafts)
  const id = randomUUID()
  await store.save({ editorDraftId: id, expectedRevision: 0, content: { ...content, generation } })
  const starting = drafts.start({
    authorityExecutionHostId: 'local',
    draftId: generation.draftId,
    worktree: 'folder:test',
    objective: 'generate',
    judge: 'codex'
  })
  await vi.waitFor(() => expect(resolveWorkspace).toBeDefined())
  expect(await store.delete({ editorDraftId: id, expectedRevision: 1 })).toEqual({
    status: 'deleted'
  })
  resolveWorkspace?.(home)
  expect(await starting).toMatchObject({ status: 'cancelled' })
  expect(run).not.toHaveBeenCalled()
  expect(await store.get(id)).toBeNull()
})
