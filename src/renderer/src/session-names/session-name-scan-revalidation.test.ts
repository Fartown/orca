import { afterEach, expect, it, vi } from 'vitest'
import { createSessionNameStore } from './session-name-store'
import { scannedSession } from './scanned-session-name-test-fixture'
import { canonicalSessionTitleKey } from '../lib/canonical-session-titles'
import type {
  AiVaultSessionTitlesArgs,
  AiVaultSessionTitlesResult
} from '../../../shared/ai-vault-session-title'

afterEach(() => vi.useRealTimers())

it('deduplicates changed scans, keeps confirmed names on an unavailable host, and does not cross hosts', async () => {
  let finish!: (result: AiVaultSessionTitlesResult) => void
  const resolve = vi.fn<(args: AiVaultSessionTitlesArgs) => Promise<AiVaultSessionTitlesResult>>(
    () =>
      new Promise<AiVaultSessionTitlesResult>((done) => {
        finish = done
      })
  )
  const store = createSessionNameStore(resolve)
  const old = scannedSession({
    providerName: { kind: 'named', title: 'Local confirmed', field: 'custom-title' }
  })
  const remote = {
    ...old,
    executionHostId: 'ssh:other' as const,
    providerName: { kind: 'named' as const, title: 'Remote confirmed', field: 'custom-title' }
  }
  store.seed([old, remote])
  const changed = {
    ...remote,
    providerName: { kind: 'named' as const, title: 'Remote renamed', field: 'custom-title' }
  }
  store.seed([changed])
  store.seed([changed])
  await vi.waitFor(() => expect(resolve).toHaveBeenCalledTimes(1))
  expect(resolve.mock.calls[0]?.[0]).toEqual({
    executionHostScope: 'ssh:other',
    requests: [{ agent: 'claude', sessionId: remote.sessionId, transcriptPath: remote.filePath }]
  })
  finish({
    titles: [],
    nameEvidence: [
      { agent: 'claude', sessionId: remote.sessionId, providerName: { kind: 'unavailable' } }
    ]
  })
  await store.read([
    {
      executionHostId: 'ssh:other',
      agent: 'claude',
      sessionId: remote.sessionId,
      transcriptPath: remote.filePath
    }
  ])
  expect(
    store.getSnapshot().get(canonicalSessionTitleKey('local', 'claude', old.sessionId))?.title
  ).toBe('Local confirmed')
  expect(
    store.getSnapshot().get(canonicalSessionTitleKey('ssh:other', 'claude', remote.sessionId))
      ?.title
  ).toBe('Remote confirmed')
})

it('does not read unchanged, absent, or shared-parent child scans', async () => {
  const resolve = vi.fn(async () => ({ titles: [] }))
  const store = createSessionNameStore(resolve)
  const session = scannedSession({
    providerName: { kind: 'named', title: 'Confirmed', field: 'custom-title' }
  })
  store.seed([session])
  store.seed([session])
  store.seed([{ ...session, providerName: { kind: 'absent' } }])
  store.seed([
    {
      ...session,
      providerName: { kind: 'named', title: 'Child', field: 'agent-name' },
      subagent: { parentSessionId: session.sessionId, agentType: 'reviewer', status: null }
    }
  ])
  await Promise.resolve()
  expect(resolve).not.toHaveBeenCalled()
  expect([...store.getSnapshot().values()].map((slot) => slot.title)).toEqual(['Confirmed'])
})

it('revalidates a late native name and first eligible task without waiting for a tab', async () => {
  const original = scannedSession({ providerName: { kind: 'absent' }, generatedTitle: null })
  const updated = scannedSession({
    providerName: { kind: 'named', title: 'Late native', field: 'custom-title' }
  })
  const resolve = vi.fn(async () => ({
    titles: [],
    nameEvidence: [
      {
        agent: 'claude' as const,
        sessionId: original.sessionId,
        providerName: updated.providerName!,
        generatedTitle: updated.generatedTitle
      }
    ]
  }))
  const store = createSessionNameStore(resolve)
  store.seed([original])
  store.seed([updated])
  await store.read([
    {
      executionHostId: 'local',
      agent: 'claude',
      sessionId: original.sessionId,
      transcriptPath: original.filePath
    }
  ])
  expect(resolve).toHaveBeenCalledTimes(1)
  expect([...store.getSnapshot().values()][0]).toMatchObject({
    title: 'Late native',
    generatedTitle: 'Fix the session title'
  })
})
