import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProcessResult } from '../../shared/child-process/run-process'
import type { GoalDraftAcceptanceParams } from '../../shared/goals/goal-control-contract'
import type { RuntimeTerminalShow } from '../../shared/runtime-terminal-contracts'
import { GoalAcceptanceDrafts } from './goal-acceptance-drafts'

let home: string
const params: GoalDraftAcceptanceParams = {
  draftId: '11111111-1111-4111-8111-111111111111',
  authorityExecutionHostId: 'local',
  objective: '实现目标',
  judge: 'codex',
  binding: { worktree: 'folder-1', terminal: 'term-1', expectedIncarnationId: 'inc-1' }
}
const output: ProcessResult = {
  code: 0,
  signal: null,
  stdout: '# 验收\n\n- [ ] 真实证据',
  stderr: '',
  timedOut: false
}
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'goal-draft-'))
})
afterEach(async () => {
  await rm(home, { recursive: true, force: true })
})

function setup(
  run = vi.fn(
    async (
      _spec: Parameters<
        NonNullable<ConstructorParameters<typeof GoalAcceptanceDrafts>[0]['run']>
      >[0]
    ) => output
  )
) {
  const admission = { validate: vi.fn(async () => ({ worktreePath: home }) as RuntimeTerminalShow) }
  const drafts = new GoalAcceptanceDrafts({
    goalHome: home,
    entryPath: '/bundle/goal-driver.js',
    admission,
    run: async (spec) => {
      const result = await run(spec)
      const outputIndex = spec.args!.indexOf('--output-last-message')
      await writeFile(spec.args![outputIndex + 1], result.stdout, 'utf8')
      return result
    }
  })
  return { drafts, run, admission }
}
async function done(drafts: GoalAcceptanceDrafts) {
  await vi.waitFor(async () =>
    expect((await drafts.get(params.draftId))?.status).not.toBe('generating')
  )
  return drafts.get(params.draftId)
}

describe('acceptance document generation', () => {
  it('resolves folder workspace on the host, persists a document, and replays the same job', async () => {
    const { drafts, run, admission } = setup()
    expect((await drafts.start(params)).status).toBe('generating')
    await drafts.start(params)
    expect(await done(drafts)).toMatchObject({
      status: 'ready',
      document: output.stdout,
      workspace: home
    })
    expect(admission.validate).toHaveBeenCalledWith(params.binding)
    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: home, detached: true, terminationBarrier: true })
    )
    expect(
      await readFile(join(home, 'v2', 'drafts', params.draftId, 'acceptance.md'), 'utf8')
    ).toBe(output.stdout)
    await expect(drafts.start({ ...params, objective: '另一目标' })).rejects.toThrow('already used')
  })

  it.each([
    { ...output, code: 1, stderr: 'not logged in' },
    { ...output, timedOut: true },
    { ...output, stdout: '' },
    { ...output, stdout: 'x'.repeat(32001) },
    { ...output, outputTruncated: true }
  ])('never marks a failed, truncated or empty generation ready', async (result) => {
    const { drafts } = setup(vi.fn(async () => result))
    await drafts.start(params)
    expect(await done(drafts)).toMatchObject({
      status: 'failed',
      document: null,
      objective: params.objective
    })
  })

  it('preserves Claude error details instead of treating an error as a document', async () => {
    const run = vi.fn(async () => ({
      ...output,
      stdout: JSON.stringify({ is_error: true, result: 'Model unavailable' })
    }))
    const drafts = new GoalAcceptanceDrafts({
      goalHome: home,
      entryPath: '/bundle/goal-driver.js',
      admission: { validate: async () => ({ worktreePath: home }) as RuntimeTerminalShow },
      run
    })
    await drafts.start({ ...params, judge: 'claude' })
    expect(await done(drafts)).toMatchObject({
      status: 'failed',
      document: null,
      error: expect.stringContaining('Model unavailable')
    })
  })
  it('recovers a saved draft without running the guard again', async () => {
    const first = setup()
    await first.drafts.start(params)
    await done(first.drafts)
    first.drafts.dispose()
    const second = setup()
    await second.drafts.start(params)
    expect(await done(second.drafts)).toMatchObject({ status: 'ready', document: output.stdout })
    expect(second.run).not.toHaveBeenCalled()
  })
  it('refuses an obsolete terminal before invoking the provider', async () => {
    const { drafts, run, admission } = setup()
    admission.validate.mockResolvedValueOnce({
      code: 'target_changed',
      message: 'restarted'
    } as never)
    await drafts.start(params)
    expect(await done(drafts)).toMatchObject({ status: 'failed', error: 'restarted' })
    expect(run).not.toHaveBeenCalled()
  })

  it('cancels the provider and discards even a successful-looking late document', async () => {
    let release!: (result: ProcessResult) => void
    const run = vi.fn(
      () =>
        new Promise<ProcessResult>((resolve) => {
          release = resolve
        })
    )
    const { drafts } = setup(run)
    await drafts.start(params)
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    const cancellation = drafts.cancel(params.draftId)
    release(output)
    expect(await cancellation).toMatchObject({ status: 'cancelled', document: null })
  })
})
