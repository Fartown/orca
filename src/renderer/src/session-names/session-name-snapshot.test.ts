import { expect, it, vi } from 'vitest'
import type { AiVaultSessionTitlesResult } from '../../../shared/ai-vault-session-title'
import { createSessionNameStore } from './session-name-store'
import { nativeResult } from './session-name-binding-test-fixture'

const request = { executionHostId: 'ssh:dev-box' as const, agent: 'codex' as const, sessionId: 'A' }

it('shares one exact read across event snapshots and live consumers', async () => {
  const resolve = vi.fn(async () => nativeResult('Native A'))
  const names = createSessionNameStore(resolve)
  const live = names.read([request])
  const [first, second] = await Promise.all([
    names.readSnapshot(request),
    names.readSnapshot(request),
    live
  ])
  expect(resolve).toHaveBeenCalledTimes(1)
  expect(first?.title).toBe('Native A')
  expect(second).toEqual(first)
  expect((await names.readSnapshot(request))?.title).toBe('Native A')
  expect(resolve).toHaveBeenCalledTimes(1)
})

it('does not strand a snapshot invalidated before its queued read starts', async () => {
  const resolve = vi.fn(async () => nativeResult('Never read'))
  const names = createSessionNameStore(resolve)
  const snapshot = names.readSnapshot(request)
  names.invalidate([request])
  expect((await snapshot)?.title).toBe('Codex A')
  expect(resolve).not.toHaveBeenCalled()
})

it('drops a snapshot when the store resets while the host request is running', async () => {
  let finish!: (result: AiVaultSessionTitlesResult) => void
  const resolve = vi.fn(
    () =>
      new Promise<AiVaultSessionTitlesResult>((done) => {
        finish = done
      })
  )
  const names = createSessionNameStore(resolve)
  const snapshot = names.readSnapshot(request)
  await vi.waitFor(() => expect(resolve).toHaveBeenCalledTimes(1))
  names.reset()
  expect(await snapshot).toBeUndefined()
  finish(nativeResult('Old host A'))
  await Promise.resolve()
  expect(names.getSnapshot().size).toBe(0)
})

it('waits for a different transcript request, then reads its own exact path', async () => {
  let finish!: (result: AiVaultSessionTitlesResult) => void
  const resolve = vi
    .fn(async () => nativeResult('Own path'))
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          finish = done
        })
    )
  const names = createSessionNameStore(resolve)
  const other = names.readSnapshot({ ...request, transcriptPath: '/other.jsonl' })
  const own = names.readSnapshot({ ...request, transcriptPath: '/own.jsonl' })
  await vi.waitFor(() => expect(resolve).toHaveBeenCalledTimes(1))
  finish(nativeResult('Other path'))
  expect((await other)?.title).toBe('Other path')
  expect((await own)?.title).toBe('Own path')
  expect(resolve).toHaveBeenLastCalledWith({
    executionHostScope: request.executionHostId,
    requests: [{ agent: 'codex', sessionId: 'A', transcriptPath: '/own.jsonl' }]
  })
})

it.each(['absent', 'unavailable', 'cleared'] as const)(
  'preserves evidence semantics for a %s snapshot',
  async (kind) => {
    const resolve = vi.fn(async (): Promise<AiVaultSessionTitlesResult> => ({
      titles: [],
      nameEvidence: [
        { agent: 'codex', sessionId: 'A', providerName: { kind }, generatedTitle: 'Stable task' }
      ]
    }))
    const names = createSessionNameStore(resolve)
    names.publish(request.executionHostId, nativeResult('Previous native'))
    const snapshot = await names.readSnapshot(request)
    expect(snapshot?.title).toBe(kind === 'cleared' ? 'Stable task' : 'Previous native')
  }
)
