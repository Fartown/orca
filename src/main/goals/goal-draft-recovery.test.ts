import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { GoalAcceptanceDrafts } from './goal-acceptance-drafts'
import { draftActivityObserver } from './goal-acceptance-draft-runner'
import { GoalEditorDraftStore } from './goal-editor-draft-store'
import { writeJsonAtomic } from './goal-record-files'
import type { GoalEditorDraftContent } from '../../shared/goals/goal-editor-draft-contract'
import type { GoalDraftAcceptanceParams } from '../../shared/goals/goal-control-contract'

let home: string
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'goal-recovery-'))
})
afterEach(async () => {
  await rm(home, { recursive: true, force: true })
})
const params: GoalDraftAcceptanceParams = {
  authorityExecutionHostId: 'local',
  draftId: randomUUID(),
  worktree: 'folder:one',
  objective: '验收',
  judge: 'codex'
}
const content: GoalEditorDraftContent = {
  fields: {
    objective: '未完成表单',
    acceptanceDocument: '手写\n',
    acceptanceText: '',
    criteria: [],
    extraChecks: '',
    checkAll: false,
    onBlocked: 'ask',
    judge: 'codex',
    maxTurns: '',
    maxMinutes: 'abc',
    checkTimeoutSeconds: '900'
  },
  target: { worktreeId: 'folder:one', paneKey: null },
  goalId: null,
  documentContext: null,
  generation: null,
  archived: false,
  operationId: randomUUID()
}
function setup() {
  let finish!: () => void
  const run = vi.fn(async (spec) => {
    await new Promise<void>((resolve) => {
      finish = resolve
      spec.signal.addEventListener('abort', resolve, { once: true })
    })
    await writeFile(spec.args[spec.args.indexOf('--output-last-message') + 1], '# ready')
    return { code: 0, stdout: '', stderr: '', signal: null, timedOut: false }
  })
  const deps = {
    goalHome: home,
    entryPath: '/test/goal-driver.js',
    admission: { validate: vi.fn() },
    resolveWorkspace: vi.fn(async () => home),
    run
  }
  return { drafts: new GoalAcceptanceDrafts(deps), deps, run, finish: () => finish() }
}

it('keeps the provider running when its App service disposes, then restores the saved result', async () => {
  const { drafts, deps, run, finish } = setup()
  await drafts.start(params)
  await vi.waitFor(() => expect(run).toHaveBeenCalled())
  drafts.dispose()
  expect(run.mock.calls[0][0].signal.aborted).toBe(false)
  finish()
  await vi.waitFor(async () => expect((await drafts.get(params.draftId))?.status).toBe('ready'))
  const restored = new GoalAcceptanceDrafts(deps)
  expect((await restored.start(params)).document).toBe('# ready')
  expect(await readFile((await restored.get(params.draftId))!.documentPath!, 'utf8')).toBe(
    '# ready'
  )
  expect(run).toHaveBeenCalledTimes(1)
})

it('a restarted service can stop an existing runner through its persisted control file', async () => {
  const { drafts, deps, run } = setup()
  await drafts.start(params)
  await vi.waitFor(() => expect(run).toHaveBeenCalled())
  await writeJsonAtomic(join(home, 'v2', 'drafts', params.draftId, 'owner.json'), { pid: 123 })
  const restored = new GoalAcceptanceDrafts({
    ...deps,
    run: undefined,
    inspect: async () => ({ status: 'live' })
  })
  expect((await restored.cancel(params.draftId))?.phase).toBe('stopping')
  await vi.waitFor(async () =>
    expect((await restored.get(params.draftId))?.status).toBe('cancelled')
  )
  expect((await drafts.get(params.draftId))?.document).toBeNull()
})

it('does not turn an unverifiable process into a failure; confirms exit before reporting interruption', async () => {
  const { drafts, deps, run, finish } = setup()
  await drafts.start(params)
  await vi.waitFor(() => expect(run).toHaveBeenCalled())
  await writeJsonAtomic(join(home, 'v2', 'drafts', params.draftId, 'owner.json'), { pid: 123 })
  const inspect = vi.fn(async () => ({ status: 'unverifiable' as const, reason: 'offline' }))
  const restored = new GoalAcceptanceDrafts({ ...deps, run: undefined, inspect })
  expect(await restored.get(params.draftId)).toMatchObject({
    status: 'generating',
    phase: 'unverifiable'
  })
  finish()
  await vi.waitFor(async () => expect((await drafts.get(params.draftId))?.status).toBe('ready'))
  const dir = join(home, 'v2', 'drafts', params.draftId)
  await writeJsonAtomic(join(dir, 'result.json'), {
    ...(await drafts.get(params.draftId)),
    status: 'generating',
    document: null
  })
  inspect.mockResolvedValue({ status: 'exited' } as never)
  expect(await restored.get(params.draftId)).toMatchObject({
    status: 'failed',
    phase: 'interrupted'
  })
})

it('atomically saves incomplete forms, rejects stale concurrent saves and replays a lost response', async () => {
  const { drafts } = setup()
  const store = new GoalEditorDraftStore(home, drafts)
  const id = randomUUID()
  const first = await store.save({ editorDraftId: id, expectedRevision: 0, content })
  expect(await readFile(first.documentPath!, 'utf8')).toBe(content.fields.acceptanceDocument)
  const update = { ...content, fields: { ...content.fields, acceptanceDocument: '最新人工稿\n' } }
  const one = store.save({ editorDraftId: id, expectedRevision: 1, content: update })
  const two = store.save({
    editorDraftId: id,
    expectedRevision: 1,
    content: { ...content, archived: true }
  })
  await expect(one).resolves.toMatchObject({ revision: 2 })
  await expect(two).rejects.toThrow('another editor')
  expect(
    await store.save({ editorDraftId: id, expectedRevision: 1, content: update })
  ).toMatchObject({ revision: 2 })
  expect(await new GoalEditorDraftStore(home, drafts).get(id)).toMatchObject({
    fields: update.fields,
    createdAt: first.createdAt
  })
  expect((await store.list()).items[0]).toMatchObject({ editorDraftId: id, hasDocument: true })
  const saved = (await store.get(id))!
  expect(await readFile(saved.documentPath!, 'utf8')).toBe(update.fields.acceptanceDocument)
  expect(saved.documentPath).not.toBe(first.documentPath)
  expect(await readFile(first.documentPath!, 'utf8')).toBe(content.fields.acceptanceDocument)
})

it('reports split structured tool events without exposing reasoning or tool arguments', () => {
  const observe = vi.fn()
  const sink = draftActivityObserver(observe)
  sink('{"type":"thread.started"}\n{"type":"item.started","item":')
  sink('{"type":"command_execution","command":"private"}}\n')
  sink('{"type":"item.completed","item":{"type":"reasoning","text":"private reasoning"}}\n')
  expect(observe.mock.calls).toEqual([['connected'], ['tool']])
})
