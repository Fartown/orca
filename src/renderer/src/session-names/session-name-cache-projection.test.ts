import { afterEach, expect, it, vi } from 'vitest'
import { canonicalSessionTitleKey } from '../lib/canonical-session-titles'
import { startAiVaultTabTitleSync } from '../lib/ai-vault-tab-title-sync'
import { fixture, nativeResult } from './session-name-binding-test-fixture'
import { createSessionNameStore } from './session-name-store'

vi.mock('@/runtime/sync-runtime-graph', () => ({ scheduleRuntimeGraphSync: vi.fn() }))
const stops: (() => void)[] = []
afterEach(() => stops.splice(0).forEach((stop) => stop()))

it.each(['ssh:dev-box', 'local'] as const)(
  'projects confirmed %s names without waiting for input quiet or another file read',
  (host) => {
    const store = fixture()
    store.setState({ activeWorkspaceExecutionHostId: host })
    const resolve = vi.fn(async () => ({ titles: [] }))
    const names = createSessionNameStore(resolve)
    store.getState().setAiVaultTabTitle('tab', nativeResult('Old native').titles[0])
    stops.push(
      startAiVaultTabTitleSync({
        getState: store.getState,
        subscribe: store.subscribe,
        resolveSessionTitles: names.resolveSessionTitles,
        subscribeSessionNames: names.subscribe,
        getSessionName: (request) =>
          names
            .getSnapshot()
            .get(
              canonicalSessionTitleKey(
                request.executionHostId,
                request.agent,
                request.providerSession.id
              )
            ),
        getCanonicalTitle: () => 'Manual fallback',
        scheduleReconcile: () => () => undefined
      })
    )
    names.publish(host, nativeResult('New native'))
    expect(store.slot()).toMatchObject({ title: 'New native', manualTitle: 'Manual fallback' })
    expect(store.getState().unifiedTabsByWorktree.workspace[0].aiVaultTitle?.title).toBe(
      'New native'
    )
    expect(resolve).not.toHaveBeenCalled()

    names.publish(host === 'local' ? 'ssh:other' : 'local', nativeResult('Other host'))
    expect(store.slot()?.title).toBe('New native')
    store.replaceIdentity('B')
    names.publish(host, nativeResult('Late A'))
    expect(store.slot()?.title).not.toBe('Late A')
    names.publish(host, nativeResult('Native B', 'B'))
    expect(store.slot()?.title).toBe('Native B')
    names.publish(host, {
      titles: [],
      nameEvidence: [{ agent: 'codex', sessionId: 'B', providerName: { kind: 'unavailable' } }]
    })
    expect(store.slot()?.title).toBe('Native B')
    names.publish(host, {
      titles: [],
      nameEvidence: [{ agent: 'codex', sessionId: 'B', providerName: { kind: 'cleared' } }]
    })
    expect(store.slot()?.title).toBe('Manual fallback')
  }
)
