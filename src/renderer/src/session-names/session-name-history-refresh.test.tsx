// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useCanonicalSessionTitles } from '../components/right-sidebar/use-canonical-session-titles'
import { sessionNameStore } from './session-name-store'
import { scannedSession } from './scanned-session-name-test-fixture'
import { canonicalSessionTitleKey } from '../lib/canonical-session-titles'

afterEach(() => {
  cleanup()
  sessionNameStore.reset()
  vi.unstubAllGlobals()
})

it('refreshes a renamed History-only session through the authoritative reader, with no tab consumer', async () => {
  const oldScan = scannedSession({
    providerName: { kind: 'named', title: 'Old native', field: 'custom-title.customTitle' }
  })
  const newScan = {
    ...oldScan,
    providerName: {
      kind: 'named' as const,
      title: 'Renamed native',
      field: 'custom-title.customTitle'
    }
  }
  const resolve = vi.fn(async () => ({
    titles: [],
    nameEvidence: [
      { agent: 'claude', sessionId: oldScan.sessionId, providerName: newScan.providerName }
    ]
  }))
  vi.stubGlobal('api', { aiVault: { resolveSessionTitles: resolve } })
  const key = canonicalSessionTitleKey('local', 'claude', oldScan.sessionId)
  const hook = renderHook(({ sessions }) => useCanonicalSessionTitles(sessions), {
    initialProps: { sessions: [oldScan] }
  })
  expect(hook.result.current.getCanonicalTitle(oldScan)).toBe('Old native')
  hook.rerender({ sessions: [newScan] })
  await waitFor(() => expect(hook.result.current.getCanonicalTitle(newScan)).toBe('Renamed native'))
  expect(hook.result.current.canonicalTitleBySessionKey.get(key)).toBe('Renamed native')
  expect(resolve).toHaveBeenCalledExactlyOnceWith({
    executionHostScope: 'local',
    requests: [{ agent: 'claude', sessionId: oldScan.sessionId, transcriptPath: oldScan.filePath }]
  })
})

it('does not let a stale scan overwrite a newer exact name while revalidation is held', async () => {
  const scan = scannedSession({
    providerName: { kind: 'named', title: 'Stale scan', field: 'custom-title.customTitle' }
  })
  const result = {
    titles: [],
    nameEvidence: [
      {
        agent: 'claude' as const,
        sessionId: scan.sessionId,
        providerName: {
          kind: 'named' as const,
          title: 'Current native',
          field: 'custom-title.customTitle'
        }
      }
    ]
  }
  sessionNameStore.publish('local', result)
  let finish!: (value: typeof result) => void
  const resolve = vi.fn(
    () =>
      new Promise<typeof result>((done) => {
        finish = done
      })
  )
  vi.stubGlobal('api', { aiVault: { resolveSessionTitles: resolve } })
  const hook = renderHook(() => useCanonicalSessionTitles([scan]))
  await waitFor(() => expect(resolve).toHaveBeenCalledTimes(1))
  expect(hook.result.current.getCanonicalTitle(scan)).toBe('Current native')
  await act(async () => {
    finish(result)
  })
  expect(hook.result.current.getCanonicalTitle(scan)).toBe('Current native')
})
