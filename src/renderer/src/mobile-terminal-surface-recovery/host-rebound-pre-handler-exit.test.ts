import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getHibernationPtyBindingFirstSeenAtByPaneKey,
  observeHibernationPtyBindings,
  resetHibernationPaneAgeForTests
} from '@/lib/agent-session/hibernation/agent-hibernation-pane-age'
import { DEFAULT_AGENT_HIBERNATION_IDLE_MS } from '@/lib/agent-session/hibernation/agent-hibernation-planner'
import {
  bufferPreHandlerPtyData,
  bufferPreHandlerPtyExit,
  clearPreHandlerPtyState,
  discardPreHandlerPtyState,
  drainPreHandlerPtyData,
  hasPreHandlerPtyExit,
  isPreHandlerPtyStateDiscarded
} from '@/components/terminal-pane/pty-transport/delivery/pty-pre-handler-buffer'
import { createIpcPtyTransport } from '@/components/terminal-pane/pty-transport/ipc/pty-transport'
import { makeWorktree } from '@/store/slices/worktrees/worktree.test-fixture'
import { makeTab } from '@/store/terminals/testing/terminal-tab.test-fixture'
import { createTestStore, seedStore } from '@/store/testing/app-store-test-fixture'
import type { PtySessionLifecycle } from '../../../shared/terminal/pty/lifecycle/pty-listed-session'

function createSessionMockApi() {
  return {
    session: {
      get: vi.fn().mockResolvedValue({}),
      patch: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(undefined),
      flush: vi.fn().mockResolvedValue(undefined)
    }
  }
}

const mocks = vi.hoisted(() => {
  const store: { current: ReturnType<typeof createTestStore> | null } = { current: null }
  return { store }
})

function testStore(): ReturnType<typeof createTestStore> {
  if (!mocks.store.current) {
    throw new Error('test store not created')
  }
  return mocks.store.current
}

vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }))
vi.mock('@/store/index', () => ({
  useAppStore: {
    getState: () => testStore().getState(),
    setState: (...args: Parameters<ReturnType<typeof createTestStore>['setState']>) =>
      testStore().setState(...args),
    subscribe: () => () => {}
  }
}))

import { createWorktreeEventRuntime } from '@/hooks/ipc-events/workspace-catalog/worktree-event-runtime'

const WORKTREE = 'repo1::/repo1/main'
const TAB_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const LEAF_ID = '11111111-1111-4111-8111-111111111111'
const PANE_KEY = `${TAB_ID}:${LEAF_ID}`
const REUSED_PTY_ID = `${WORKTREE}@@ffae7e0c`
const OLD_INCARNATION = '11111111-1111-4111-8111-aaaaaaaaaaaa'
const NEW_INCARNATION = '22222222-2222-4222-8222-bbbbbbbbbbbb'

describe('host pty:spawned recovery clears stale pre-handler exits without losing startup output', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetHibernationPaneAgeForTests()
    clearPreHandlerPtyState(REUSED_PTY_ID)
  })

  afterEach(() => {
    clearPreHandlerPtyState(REUSED_PTY_ID)
    resetHibernationPaneAgeForTests()
    vi.unstubAllGlobals()
  })

  it('drops prior-incarnation exit and resets pane age on pty:spawned while retaining startup bytes for attach', async () => {
    const spawnedHook: { listener?: (event: PtySessionLifecycle) => void } = {}
    const spawn = vi.fn().mockResolvedValue({
      id: REUSED_PTY_ID,
      isReattach: true,
      incarnationId: NEW_INCARNATION
    })
    vi.stubGlobal('window', {
      dispatchEvent: vi.fn(),
      api: {
        ...createSessionMockApi(),
        pty: {
          spawn,
          write: vi.fn(),
          writeAccepted: vi.fn().mockResolvedValue(true),
          resize: vi.fn(),
          kill: vi.fn().mockResolvedValue(undefined),
          onData: vi.fn(() => () => {}),
          onReplay: vi.fn(() => () => {}),
          onExit: vi.fn(() => () => {}),
          onSpawned: vi.fn((cb: (event: PtySessionLifecycle) => void) => {
            spawnedHook.listener = cb
            return () => {
              spawnedHook.listener = undefined
            }
          }),
          onWriteUnavailable: vi.fn(() => () => {})
        }
      }
    })

    const store = createTestStore()
    mocks.store.current = store
    seedStore(store, {
      worktreesByRepo: {
        repo1: [makeWorktree({ id: WORKTREE, repoId: 'repo1', path: '/repo1/main' })]
      },
      tabsByWorktree: {
        [WORKTREE]: [makeTab({ id: TAB_ID, worktreeId: WORKTREE, ptyId: null })]
      },
      terminalLayoutsByTabId: {
        [TAB_ID]: {
          root: { type: 'leaf', leafId: LEAF_ID },
          activeLeafId: LEAF_ID,
          expandedLeafId: null,
          ptyIdsByLeafId: { [LEAF_ID]: REUSED_PTY_ID }
        }
      }
    })

    observeHibernationPtyBindings({
      tabsByWorktree: store.getState().tabsByWorktree,
      terminalLayoutsByTabId: store.getState().terminalLayoutsByTabId,
      now: 10_000,
      idleMs: DEFAULT_AGENT_HIBERNATION_IDLE_MS
    })
    // Prior hibernated process exited, then host respawned same PTY id and emitted startup output before mount.
    bufferPreHandlerPtyExit(REUSED_PTY_ID, 0, OLD_INCARNATION)
    bufferPreHandlerPtyData(REUSED_PTY_ID, 'claude-ready-prompt> ')
    expect(hasPreHandlerPtyExit(REUSED_PTY_ID)).toBe(true)

    const unsubs: (() => void)[] = []
    createWorktreeEventRuntime(unsubs, () => false)
    expect(spawnedHook.listener).toBeDefined()

    spawnedHook.listener?.({ id: REUSED_PTY_ID, incarnationId: NEW_INCARNATION })

    // Prior-incarnation exit and stale pane age are gone, while startup bytes remain buffered.
    expect(hasPreHandlerPtyExit(REUSED_PTY_ID)).toBe(false)
    expect(getHibernationPtyBindingFirstSeenAtByPaneKey()[PANE_KEY]).toBeUndefined()

    const received: string[] = []
    const onPtyExit = vi.fn()
    const transport = createIpcPtyTransport({ onPtyExit })
    const connected = await transport.connect({
      url: '',
      sessionId: REUSED_PTY_ID,
      callbacks: { onData: (chunk) => received.push(chunk) }
    })

    expect(spawn).toHaveBeenCalledTimes(1)
    expect(onPtyExit).not.toHaveBeenCalled()
    expect(connected).toMatchObject({ id: REUSED_PTY_ID, isReattach: true })
    expect(received.join('')).toContain('claude-ready-prompt> ')

    for (const unsub of unsubs) {
      unsub()
    }
  })

  it('preserves a matching-incarnation fast exit while clearing legacy unnamed exits and discard timers', () => {
    const spawnedHook: { listener?: (event: PtySessionLifecycle) => void } = {}
    vi.stubGlobal('window', {
      dispatchEvent: vi.fn(),
      api: {
        ...createSessionMockApi(),
        pty: {
          onSpawned: vi.fn((cb: (event: PtySessionLifecycle) => void) => {
            spawnedHook.listener = cb
            return () => {}
          })
        }
      }
    })
    mocks.store.current = createTestStore()
    createWorktreeEventRuntime([], () => false)

    discardPreHandlerPtyState(REUSED_PTY_ID)
    expect(isPreHandlerPtyStateDiscarded(REUSED_PTY_ID)).toBe(true)

    spawnedHook.listener?.({ id: REUSED_PTY_ID, incarnationId: NEW_INCARNATION })
    expect(isPreHandlerPtyStateDiscarded(REUSED_PTY_ID)).toBe(false)

    // Matching-incarnation exit survives while foreign & unnamed legacy exits are stripped.
    bufferPreHandlerPtyExit(REUSED_PTY_ID, 0, OLD_INCARNATION)
    bufferPreHandlerPtyExit(REUSED_PTY_ID, 1)
    bufferPreHandlerPtyExit(REUSED_PTY_ID, 137, NEW_INCARNATION)
    bufferPreHandlerPtyData(REUSED_PTY_ID, 'fatal-startup-error')

    spawnedHook.listener?.({ id: REUSED_PTY_ID, incarnationId: NEW_INCARNATION })

    expect(hasPreHandlerPtyExit(REUSED_PTY_ID, OLD_INCARNATION)).toBe(false)
    expect(hasPreHandlerPtyExit(REUSED_PTY_ID, NEW_INCARNATION)).toBe(true)
    const drained: string[] = []
    drainPreHandlerPtyData(REUSED_PTY_ID, (data) => drained.push(data))
    expect(drained).toEqual(['fatal-startup-error'])
  })
})
