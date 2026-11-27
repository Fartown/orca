import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearNativeChatComposerDraftsForTests } from '@/components/native-chat/drafts/native-chat-draft-reset'

type PendingCreationState = { pendingWorktreeCreations: Record<string, unknown> }
type PendingCreationListener = (state: PendingCreationState) => void
type BeginArgs = {
  beforeOpen?: (sessionId: string) => boolean | void
  onTabOpenSettled?: (tabId: string | null, reason?: 'layout-refused') => void
}
const mocks = vi.hoisted(() => {
  const state: PendingCreationState & {
    activeView: string
    activePendingCreationId: string | null
    unifiedTabsByWorktree: Record<string, never[]>
    updatePendingWorktreeCreation: (id: string, patch: unknown) => void
    getTab: (id: string) => {
      id: string
      contentType: 'agent-session'
      entityId: string
      executionHostId: 'local'
    } | null
  } = {
    activeView: 'terminal',
    activePendingCreationId: 'creation-1',
    unifiedTabsByWorktree: {},
    pendingWorktreeCreations: Object.fromEntries([['creation-1', {}]]),
    updatePendingWorktreeCreation: vi.fn<(id: string, patch: unknown) => void>(),
    getTab: (id) =>
      id === 'agent-session:session-1'
        ? { id, contentType: 'agent-session', entityId: 'session-1', executionHostId: 'local' }
        : null
  }
  return {
    state,
    launchAgentInNewTabWithOutcome: vi.fn(),
    beginStructuredAgentSessionProvisionalLaunch: vi.fn<
      (args: BeginArgs) => {
        sessionId: string | null
        tab: { id: string } | null
        settlement: Promise<
          | { kind: 'structured'; sessionId: string }
          | { kind: 'cancelled'; sessionId: null }
          | { kind: 'terminal' }
        >
        cancel: () => void
      } | null
    >(),
    activateAndRevealWorktree: vi.fn<(worktreeId: string, options?: unknown) => unknown>()
  }
})

vi.mock('@/store/index', () => ({
  useAppStore: Object.assign(vi.fn<() => unknown>(), {
    getState: () => mocks.state,
    subscribe: vi.fn<(listener: PendingCreationListener) => () => void>(() => () => {})
  })
}))
vi.mock('@/lib/agent-session/structured-agent-session-provisional-tab', () => ({
  beginStructuredAgentSessionProvisionalLaunch: mocks.beginStructuredAgentSessionProvisionalLaunch
}))
vi.mock('@/lib/agent-session/launch/new-tab/launch-agent-in-new-tab', () => ({
  launchAgentInNewTabWithOutcome: mocks.launchAgentInNewTabWithOutcome
}))
vi.mock('@/lib/workspace/activation/worktree-activation', () => ({
  activateAndRevealWorktree: mocks.activateAndRevealWorktree
}))
vi.mock('@/components/native-chat/composer/focus/native-chat-composer-mount', () => ({
  nativeChatComposerSelection: () => undefined,
  waitForNativeChatComposerHandoff: async () => {}
}))
vi.mock('@/components/terminal/workspace-mounting/background-terminal-worktree-mount', () => ({
  requestBackgroundTerminalWorktreeMount: vi.fn()
}))

import { launchStructuredWorktreeSessionWithOutcome } from './local-task-creation-outcome'

const request = {
  repoId: 'repo-1',
  name: 'routing-recovery',
  setupDecision: 'run' as const,
  agent: 'codex' as const,
  agentLaunchRoute: 'structured-native-chat' as const,
  pendingFirstAgentMessageRename: true,
  note: '',
  startupPlan: null,
  quickPrompt: 'Fix the route',
  quickTelemetry: null
}

const baseArgs = {
  creationId: 'creation-1',
  request,
  agentLaunchRoute: 'structured-native-chat' as const,
  worktreeId: 'worktree-1',
  shouldActivateOnCompletion: true,
  activation: false as const,
  primaryTabId: null
}

function launchHandle() {
  return {
    sessionId: 'session-1',
    tab: { id: 'agent-session:session-1' },
    settlement: new Promise<{ kind: 'structured'; sessionId: string }>(() => {}),
    cancel: vi.fn()
  }
}

describe('launchStructuredWorktreeSessionWithOutcome', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearNativeChatComposerDraftsForTests()
    mocks.state.pendingWorktreeCreations = { 'creation-1': { request } }
    mocks.launchAgentInNewTabWithOutcome.mockReturnValue(null)
    mocks.state.activePendingCreationId = 'creation-1'
    mocks.state.activeView = 'terminal'
    mocks.activateAndRevealWorktree.mockReturnValue({ primaryTabId: null })
  })

  it('reports the chat the launch settled on', async () => {
    mocks.beginStructuredAgentSessionProvisionalLaunch.mockImplementation((args) => {
      args.onTabOpenSettled?.('agent-session:session-1')
      return {
        ...launchHandle(),
        settlement: Promise.resolve({ kind: 'structured' as const, sessionId: 'session-1' })
      }
    })
    const launched = await launchStructuredWorktreeSessionWithOutcome(baseArgs)
    await expect(launched.sessionOutcome).resolves.toEqual({ kind: 'chat', sessionId: 'session-1' })
  })

  it('reports a host-declined terminal instead of claiming a chat', async () => {
    mocks.beginStructuredAgentSessionProvisionalLaunch.mockImplementation((args) => {
      args.onTabOpenSettled?.(null)
      return {
        ...launchHandle(),
        tab: null,
        settlement: Promise.resolve({ kind: 'terminal' as const })
      }
    })
    const launched = await launchStructuredWorktreeSessionWithOutcome(baseArgs)
    await expect(launched.sessionOutcome).resolves.toEqual({ kind: 'terminal', tabId: null })
  })

  it('reports the recovered terminal when the chat tab is refused', async () => {
    mocks.beginStructuredAgentSessionProvisionalLaunch.mockImplementation((args) => {
      args.onTabOpenSettled?.(null, 'layout-refused')
      return launchHandle()
    })
    mocks.launchAgentInNewTabWithOutcome.mockReturnValue({
      surface: { kind: 'local-terminal', tabId: 'recovered-terminal' }
    })
    const launched = await launchStructuredWorktreeSessionWithOutcome(baseArgs)
    await expect(launched.sessionOutcome).resolves.toEqual({
      kind: 'terminal',
      tabId: 'recovered-terminal'
    })
  })
})
