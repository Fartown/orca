// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useAiVaultSessionDeleteAction } from '../components/right-sidebar/ai-vault-session-delete-action'
import { prepareAiVaultSessionContinuation } from '../components/right-sidebar/ai-vault-session-continuation'
import { getScannedSessionDisplayName } from './session-name-display'
import { sessionNameStore } from './session-name-store'
import { scannedSession } from './scanned-session-name-test-fixture'
import {
  canonicalSessionTitleKey,
  registerCanonicalSessionTitleProvider
} from '../lib/canonical-session-titles'

const confirm = vi.hoisted(() => vi.fn())
vi.mock('@/components/confirmation-dialog-context', () => ({
  useConfirmationDialog: () => confirm
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const dispose: (() => void)[] = []
beforeEach(() => {
  confirm.mockReset().mockResolvedValue(false)
  vi.stubGlobal('api', undefined)
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { aiVault: { deleteSession: vi.fn().mockResolvedValue({ outcome: 'deleted' }) } }
  })
})
afterEach(() => {
  dispose.splice(0).forEach((stop) => stop())
  sessionNameStore.reset()
  vi.unstubAllGlobals()
})

function manualTitle(title: string) {
  const index = new Map([[canonicalSessionTitleKey('local', 'claude', 'session-A'), title]])
  dispose.push(
    registerCanonicalSessionTitleProvider({
      get: (host, agent, id) => index.get(canonicalSessionTitleKey(host, agent, id)),
      index: () => index,
      subscribe: () => () => {}
    })
  )
}

describe('History actions share the row name without changing operation identity', () => {
  it.each(['Native renamed session', '继续'])(
    'uses the cached native name %s in both actions',
    async (title) => {
      const session = scannedSession()
      const original = structuredClone(session)
      manualTitle('Manual fallback')
      sessionNameStore.publish('local', {
        titles: [],
        nameEvidence: [
          {
            agent: 'claude',
            sessionId: session.sessionId,
            providerName: {
              kind: 'named',
              title,
              field: 'custom-title'
            }
          }
        ]
      })
      const rowTitle = getScannedSessionDisplayName(session)
      expect(rowTitle).toBe(title)
      const hook = renderHook(() => useAiVaultSessionDeleteAction({ refresh: vi.fn() }))
      await hook.result.current(session)
      expect(confirm.mock.calls[0][0].description).toContain(`"${rowTitle}"`)
      expect(window.api.aiVault.deleteSession).not.toHaveBeenCalled()
      const request = prepareAiVaultSessionContinuation({
        session,
        targetWorktreeId: 'target',
        targetWorkspacePath: '/target'
      })
      expect(request.source.sourceTitle).toBe(rowTitle)
      expect(request.source.transcriptPath).toBe(session.filePath)
      expect(request.source.lastPrompt).toBe(session.lastUserPrompt)
      expect(request.initialCwd).toBe(session.cwd)
      expect(session).toEqual(original)
      hook.unmount()
    }
  )

  it('uses existing manual fallback, without taking the local title for the same remote ID', () => {
    manualTitle('Local manual name')
    for (const [executionHostId, title] of [
      ['local', 'Local manual name'],
      ['ssh:other', 'Fix the session title']
    ] as const) {
      const session = scannedSession({ executionHostId })
      const request = prepareAiVaultSessionContinuation({
        session,
        targetWorktreeId: 'target',
        targetWorkspacePath: '/target'
      })
      expect(request.source.sourceTitle).toBe(title)
    }
  })

  it('keeps the exact remote deletion target when a renamed session is confirmed', async () => {
    const session = scannedSession({
      executionHostId: 'ssh:other',
      providerName: { kind: 'named', title: 'Remote session', field: 'custom-title' }
    })
    confirm.mockResolvedValue(true)
    const refresh = vi.fn()
    const hook = renderHook(() => useAiVaultSessionDeleteAction({ refresh }))
    await hook.result.current(session)
    expect(confirm.mock.calls[0][0].description).toContain('"Remote session"')
    expect(window.api.aiVault.deleteSession).toHaveBeenCalledExactlyOnceWith({
      executionHostId: 'ssh:other',
      agent: 'claude',
      sessionId: session.sessionId,
      filePath: session.filePath
    })
    expect(refresh).toHaveBeenCalledExactlyOnceWith({ force: true })
    hook.unmount()
  })
})
