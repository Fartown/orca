// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardAgentRow as DashboardAgentRowData } from '@/components/dashboard/useDashboardData'
import { TooltipProvider } from '@/components/ui/tooltip'
import type * as ActivateTabAndFocusPaneModule from '@/lib/activate-tab-and-focus-pane'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import { folderWorkspaceKey } from '../../../../shared/workspace-scope'

const LEAF_A = '11111111-1111-4111-8111-111111111111'
const LEAF_B = '22222222-2222-4222-8222-222222222222'

type MockAgentOptions = {
  paneKey: string
  tabId: string
  agentType: string
  prompt: string
  worktreeId: string
  startedAt?: number
}

function mockAgent({
  paneKey,
  tabId,
  agentType,
  prompt,
  worktreeId,
  startedAt = 1000
}: MockAgentOptions): DashboardAgentRowData {
  return {
    paneKey,
    tab: { id: tabId },
    agentType,
    rowSource: 'live',
    state: 'working',
    startedAt,
    entry: {
      prompt,
      state: 'working',
      paneKey,
      updatedAt: startedAt,
      stateStartedAt: startedAt,
      stateHistory: [],
      worktreeId
    }
  } as unknown as DashboardAgentRowData
}

function retainedAgent(options: MockAgentOptions): DashboardAgentRowData {
  return { ...mockAgent(options), rowSource: 'retained', state: 'done' }
}

let mockAgents: DashboardAgentRowData[] = []
let mockAgentActivityDisplayMode: 'compact' | 'full' | undefined
let mockTabsByWorktree: Record<string, { id: string }[]> = {}
let mockStructuredTabIds = new Set<string>()
let mockAgentStatusByPaneKey: Record<string, { worktreeId?: string }> = {}
let mockActiveTabId: string | null = null
let mockActiveTabType: string = 'editor'
const mockSetActiveTab = vi.fn((tabId: string) => {
  mockActiveTabId = tabId
})
const mockSetActiveTabType = vi.fn((tabType: string) => {
  mockActiveTabType = tabType
})
let capturedRowActivations: {
  paneKey: string
  onActivate: (tabId: string, paneKey: string) => void
}[] = []

function buildMockStoreState(): Record<string, unknown> {
  return {
    agentActivityDisplayMode: mockAgentActivityDisplayMode,
    acknowledgedAgentsByPaneKey: {},
    cacheTimerByKey: {},
    dropAgentStatus: vi.fn(),
    dismissRetainedAgent: vi.fn(),
    acknowledgeAgents: vi.fn(),
    agentSendPopoverTargetMode: null,
    agentStatusByPaneKey: mockAgentStatusByPaneKey,
    agentStatusEpoch: 0,
    activeTabId: mockActiveTabId,
    activeTabType: mockActiveTabType,
    setActiveTab: mockSetActiveTab,
    setActiveTabType: mockSetActiveTabType,
    tabsByWorktree: mockTabsByWorktree,
    terminalLayoutsByTabId: {},
    ptyIdsByTabId: {},
    runtimePaneTitlesByTabId: {},
    sendPromptToSidebarAgentTarget: vi.fn(),
    settings: {
      promptCacheTimerEnabled: true,
      promptCacheTtlMs: 60_000
    }
  }
}

const activationMocks = vi.hoisted(() => ({
  activateAndRevealWorkspace: vi.fn(),
  activateTabAndFocusPane: vi.fn()
}))

const staleAgentRowMocks = vi.hoisted(() => ({
  dismissStaleAgentRowByKey: vi.fn()
}))

const structuredActivationMocks = vi.hoisted(() => ({
  activateStructuredAgentSessionTab: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: unknown) => unknown) => selector(buildMockStoreState()),
    {
      getState: () => buildMockStoreState()
    }
  )
}))

vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealWorkspace: activationMocks.activateAndRevealWorkspace
}))

vi.mock('@/lib/activate-tab-and-focus-pane', () => ({
  activateTabAndFocusPane: activationMocks.activateTabAndFocusPane
}))

vi.mock('../terminal-pane/stale-agent-row', () => ({
  dismissStaleAgentRowByKey: staleAgentRowMocks.dismissStaleAgentRowByKey
}))

vi.mock('@/lib/structured-agent-session-tab-activation', () => ({
  activateStructuredAgentSessionTab: structuredActivationMocks.activateStructuredAgentSessionTab
}))

vi.mock('./useWorktreeAgentRows', () => ({
  useWorktreeAgentRows: vi.fn(() => mockAgents)
}))

vi.mock('@/components/dashboard/useNow', () => ({
  useNow: vi.fn(() => 2000)
}))

vi.mock('@/components/dashboard/DashboardAgentRow', () => ({
  default: ({
    agent,
    onActivate
  }: {
    agent: DashboardAgentRowData
    onActivate: (tabId: string, paneKey: string) => void
  }) => {
    capturedRowActivations.push({ paneKey: agent.paneKey, onActivate })
    return <div data-testid="agent-row" data-pane-key={agent.paneKey} />
  }
}))

vi.mock('./focused-agent-row-highlight', () => ({
  useFocusedAgentPaneKey: vi.fn(() => null)
}))

describe('WorktreeCardAgents activation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    activationMocks.activateAndRevealWorkspace.mockImplementation(() => ({ primaryTabId: null }))
    activationMocks.activateTabAndFocusPane.mockImplementation(() => undefined)
    mockAgents = []
    mockAgentActivityDisplayMode = undefined
    mockTabsByWorktree = {}
    mockStructuredTabIds = new Set()
    mockAgentStatusByPaneKey = {}
    mockActiveTabId = null
    mockActiveTabType = 'editor'
    capturedRowActivations = []
    structuredActivationMocks.activateStructuredAgentSessionTab.mockImplementation(
      ({ tabId }: { tabId: string }) => mockStructuredTabIds.has(tabId)
    )
  })

  it('activates a projected structured session row through the unified tab path', async () => {
    mockAgentActivityDisplayMode = 'full'
    const tabId = 'structured-tab'
    const paneKey = makePaneKey(tabId, LEAF_A)
    mockAgents = [
      mockAgent({
        paneKey,
        tabId,
        agentType: 'codex',
        prompt: 'Structured session',
        worktreeId: 'wt-1'
      })
    ]
    mockAgentStatusByPaneKey = { [paneKey]: { worktreeId: 'wt-1' } }
    mockStructuredTabIds.add(tabId)
    const { default: WorktreeCardAgents } = await import('./WorktreeCardAgents')

    renderToStaticMarkup(<WorktreeCardAgents worktreeId="wt-1" />)
    capturedRowActivations[0].onActivate(tabId, paneKey)

    expect(activationMocks.activateAndRevealWorkspace).toHaveBeenCalledWith('wt-1', undefined)
    expect(structuredActivationMocks.activateStructuredAgentSessionTab).toHaveBeenCalledWith({
      worktreeId: 'wt-1',
      tabId
    })
    expect(activationMocks.activateTabAndFocusPane).not.toHaveBeenCalled()
    expect(staleAgentRowMocks.dismissStaleAgentRowByKey).not.toHaveBeenCalled()
  })

  it('reveals the worktree and focuses an automation worker row hydrated during reveal', async () => {
    mockAgentActivityDisplayMode = 'full'
    const tabId = 'worker-tab'
    const paneKey = makePaneKey(tabId, LEAF_A)
    mockAgents = [
      mockAgent({
        paneKey,
        tabId,
        agentType: 'codex',
        prompt: 'Run automation worker',
        worktreeId: 'wt-1'
      })
    ]
    mockAgentStatusByPaneKey = { [paneKey]: { worktreeId: 'wt-1' } }
    // Why: activation must use the post-reveal store snapshot, matching tab
    // hydration that arrives while a background worker is being opened.
    activationMocks.activateAndRevealWorkspace.mockImplementation(() => {
      mockTabsByWorktree = { 'wt-1': [{ id: tabId }] }
      return { primaryTabId: null }
    })
    const { default: WorktreeCardAgents } = await import('./WorktreeCardAgents')

    renderToStaticMarkup(<WorktreeCardAgents worktreeId="wt-1" />)
    expect(capturedRowActivations).toHaveLength(1)
    capturedRowActivations[0].onActivate(tabId, paneKey)

    expect(activationMocks.activateAndRevealWorkspace).toHaveBeenCalledWith('wt-1', undefined)
    expect(activationMocks.activateTabAndFocusPane).toHaveBeenCalledWith(tabId, LEAF_A, {
      ackPaneKeyOnSuccess: paneKey,
      flashFocusedPane: true,
      scrollToBottomIfOutputSinceLastView: true
    })
    expect(staleAgentRowMocks.dismissStaleAgentRowByKey).not.toHaveBeenCalled()
  })

  it('reveals the terminal surface through the helper path when activating a hydrated row', async () => {
    mockAgentActivityDisplayMode = 'full'
    const tabId = 'visible-worker-tab'
    const paneKey = makePaneKey(tabId, LEAF_A)
    mockAgents = [
      mockAgent({
        paneKey,
        tabId,
        agentType: 'codex',
        prompt: 'Show full log',
        worktreeId: 'wt-1'
      })
    ]
    mockTabsByWorktree = { 'wt-1': [{ id: tabId }] }
    mockAgentStatusByPaneKey = { [paneKey]: { worktreeId: 'wt-1' } }
    const actualActivation = await vi.importActual<typeof ActivateTabAndFocusPaneModule>(
      '@/lib/activate-tab-and-focus-pane'
    )
    // Why: keep the component import mocked for call assertions, but delegate
    // this repro to the real helper so it fails if the terminal-surface fix
    // regresses.
    activationMocks.activateTabAndFocusPane.mockImplementation(
      actualActivation.activateTabAndFocusPane
    )
    const { default: WorktreeCardAgents } = await import('./WorktreeCardAgents')

    renderToStaticMarkup(<WorktreeCardAgents worktreeId="wt-1" />)
    expect(capturedRowActivations).toHaveLength(1)
    capturedRowActivations[0].onActivate(tabId, paneKey)

    expect(activationMocks.activateAndRevealWorkspace).toHaveBeenCalledWith('wt-1', undefined)
    expect(activationMocks.activateTabAndFocusPane).toHaveBeenCalledWith(tabId, LEAF_A, {
      ackPaneKeyOnSuccess: paneKey,
      flashFocusedPane: true,
      scrollToBottomIfOutputSinceLastView: true
    })
    expect(mockActiveTabType).toBe('terminal')
    expect(mockActiveTabId).toBe(tabId)
  })

  it('keeps the execution host when an Issue row activates a folder Workspace pane', async () => {
    mockAgentActivityDisplayMode = 'full'
    const workspaceKey = folderWorkspaceKey('folder-1')
    const tabId = 'folder-worker-tab'
    const paneKey = makePaneKey(tabId, LEAF_A)
    mockAgents = [
      mockAgent({
        paneKey,
        tabId,
        agentType: 'codex',
        prompt: 'Remote folder worker',
        worktreeId: workspaceKey
      })
    ]
    mockAgentStatusByPaneKey = { [paneKey]: { worktreeId: workspaceKey } }
    activationMocks.activateAndRevealWorkspace.mockImplementation(() => {
      mockTabsByWorktree = { [workspaceKey]: [{ id: tabId }] }
      return { primaryTabId: null }
    })
    const { default: WorktreeCardAgents } = await import('./WorktreeCardAgents')
    const onAgentActivate = vi.fn()

    renderToStaticMarkup(
      <WorktreeCardAgents
        worktreeId={workspaceKey}
        executionHostId="ssh:build"
        onAgentActivate={onAgentActivate}
      />
    )
    capturedRowActivations[0].onActivate(tabId, paneKey)

    expect(onAgentActivate).toHaveBeenCalledOnce()
    expect(activationMocks.activateAndRevealWorkspace).toHaveBeenCalledWith(workspaceKey, {
      executionHostId: 'ssh:build'
    })
    expect(activationMocks.activateTabAndFocusPane).toHaveBeenCalledWith(tabId, LEAF_A, {
      ackPaneKeyOnSuccess: paneKey,
      flashFocusedPane: true,
      scrollToBottomIfOutputSinceLastView: true
    })
  })

  it('keeps the Issue view open when its Workspace cannot be activated', async () => {
    mockAgentActivityDisplayMode = 'full'
    const tabId = 'unavailable-worker-tab'
    const paneKey = makePaneKey(tabId, LEAF_A)
    mockAgents = [
      mockAgent({
        paneKey,
        tabId,
        agentType: 'codex',
        prompt: 'Unavailable remote workspace',
        worktreeId: 'wt-1'
      })
    ]
    mockTabsByWorktree = { 'wt-1': [{ id: tabId }] }
    activationMocks.activateAndRevealWorkspace.mockReturnValue(false)
    const { default: WorktreeCardAgents } = await import('./WorktreeCardAgents')
    const onAgentActivate = vi.fn()

    renderToStaticMarkup(<WorktreeCardAgents worktreeId="wt-1" onAgentActivate={onAgentActivate} />)
    capturedRowActivations[0].onActivate(tabId, paneKey)

    expect(activationMocks.activateAndRevealWorkspace).toHaveBeenCalledWith('wt-1', undefined)
    expect(onAgentActivate).not.toHaveBeenCalled()
    expect(activationMocks.activateTabAndFocusPane).not.toHaveBeenCalled()
  })

  it('keeps a live worktree-attributed row visible while its tab is hydrating', async () => {
    mockAgentActivityDisplayMode = 'full'
    const tabId = 'hydrating-worker-tab'
    const paneKey = makePaneKey(tabId, LEAF_B)
    mockAgents = [
      mockAgent({
        paneKey,
        tabId,
        agentType: 'claude',
        prompt: 'Hydrating worker',
        worktreeId: 'wt-1'
      })
    ]
    mockAgentStatusByPaneKey = { [paneKey]: { worktreeId: 'wt-1' } }
    const { default: WorktreeCardAgents } = await import('./WorktreeCardAgents')
    const onAgentActivate = vi.fn()

    renderToStaticMarkup(<WorktreeCardAgents worktreeId="wt-1" onAgentActivate={onAgentActivate} />)
    expect(capturedRowActivations).toHaveLength(1)
    capturedRowActivations[0].onActivate(tabId, paneKey)

    expect(activationMocks.activateAndRevealWorkspace).toHaveBeenCalledWith('wt-1', undefined)
    expect(activationMocks.activateTabAndFocusPane).not.toHaveBeenCalled()
    expect(onAgentActivate).not.toHaveBeenCalled()
    expect(staleAgentRowMocks.dismissStaleAgentRowByKey).not.toHaveBeenCalled()
  })

  it('keeps retained Workspace rows passive unless a consumer supplies its navigation action', async () => {
    mockAgentActivityDisplayMode = 'full'
    const tabId = 'retained-tab'
    const paneKey = makePaneKey(tabId, LEAF_A)
    mockAgents = [
      retainedAgent({
        paneKey,
        tabId,
        agentType: 'codex',
        prompt: 'Retained conversation',
        worktreeId: 'wt-1'
      })
    ]
    const { default: WorktreeCardAgents } = await import('./WorktreeCardAgents')

    renderToStaticMarkup(<WorktreeCardAgents worktreeId="wt-1" />)
    capturedRowActivations[0].onActivate(tabId, paneKey)

    expect(activationMocks.activateAndRevealWorkspace).not.toHaveBeenCalled()
    expect(activationMocks.activateTabAndFocusPane).not.toHaveBeenCalled()

    const onRetainedAgentActivate = vi.fn()
    capturedRowActivations = []
    renderToStaticMarkup(
      <WorktreeCardAgents worktreeId="wt-1" onRetainedAgentActivate={onRetainedAgentActivate} />
    )
    capturedRowActivations[0].onActivate(tabId, paneKey)

    expect(onRetainedAgentActivate).toHaveBeenCalledOnce()
    expect(activationMocks.activateAndRevealWorkspace).not.toHaveBeenCalled()
    expect(activationMocks.activateTabAndFocusPane).not.toHaveBeenCalled()
  })

  it('does not pane-focus a fallback terminal when the worker tab is still missing after reveal', async () => {
    mockAgentActivityDisplayMode = 'full'
    const tabId = 'worker-tab'
    const fallbackTabId = 'fallback-terminal-tab'
    const paneKey = makePaneKey(tabId, LEAF_A)
    mockAgents = [
      mockAgent({
        paneKey,
        tabId,
        agentType: 'codex',
        prompt: 'Reveal the real worker',
        worktreeId: 'wt-1'
      })
    ]
    mockAgentStatusByPaneKey = { [paneKey]: { worktreeId: 'wt-1' } }
    // Why: activation may create/select a different terminal before the
    // automation worker hydrates; the row must only pane-focus its exact tab.
    activationMocks.activateAndRevealWorkspace.mockImplementation(() => {
      mockTabsByWorktree = { 'wt-1': [{ id: fallbackTabId }] }
      mockSetActiveTab(fallbackTabId)
      return { primaryTabId: null }
    })
    const { default: WorktreeCardAgents } = await import('./WorktreeCardAgents')

    renderToStaticMarkup(<WorktreeCardAgents worktreeId="wt-1" />)
    expect(capturedRowActivations).toHaveLength(1)
    capturedRowActivations[0].onActivate(tabId, paneKey)

    expect(activationMocks.activateAndRevealWorkspace).toHaveBeenCalledWith('wt-1', undefined)
    expect(mockActiveTabId).toBe(fallbackTabId)
    expect(activationMocks.activateTabAndFocusPane).not.toHaveBeenCalled()
    expect(staleAgentRowMocks.dismissStaleAgentRowByKey).not.toHaveBeenCalled()
  })

  it('dismisses a malformed pane key instead of guessing a terminal pane', async () => {
    mockAgentActivityDisplayMode = 'full'
    const paneKey = 'legacy-pane-key'
    mockAgents = [
      mockAgent({
        paneKey,
        tabId: 'worker-tab',
        agentType: 'codex',
        prompt: 'Malformed worker',
        worktreeId: 'wt-1'
      })
    ]
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const { default: WorktreeCardAgents } = await import('./WorktreeCardAgents')

      renderToStaticMarkup(<WorktreeCardAgents worktreeId="wt-1" />)
      expect(capturedRowActivations).toHaveLength(1)
      capturedRowActivations[0].onActivate('worker-tab', paneKey)

      expect(activationMocks.activateAndRevealWorkspace).not.toHaveBeenCalled()
      expect(activationMocks.activateTabAndFocusPane).not.toHaveBeenCalled()
      expect(staleAgentRowMocks.dismissStaleAgentRowByKey).toHaveBeenCalledWith(paneKey)
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('dismisses a pane key whose parsed tab does not match the row tab', async () => {
    mockAgentActivityDisplayMode = 'full'
    const paneKey = makePaneKey('other-worker-tab', LEAF_B)
    mockAgents = [
      mockAgent({
        paneKey,
        tabId: 'worker-tab',
        agentType: 'claude',
        prompt: 'Mismatched worker',
        worktreeId: 'wt-1'
      })
    ]
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { default: WorktreeCardAgents } = await import('./WorktreeCardAgents')

    renderToStaticMarkup(<WorktreeCardAgents worktreeId="wt-1" />)
    expect(capturedRowActivations).toHaveLength(1)
    capturedRowActivations[0].onActivate('worker-tab', paneKey)

    expect(activationMocks.activateAndRevealWorkspace).not.toHaveBeenCalled()
    expect(activationMocks.activateTabAndFocusPane).not.toHaveBeenCalled()
    expect(staleAgentRowMocks.dismissStaleAgentRowByKey).toHaveBeenCalledWith(paneKey)
    warnSpy.mockRestore()
  })

  it('dismisses a missing tab row that is no longer attributed to this worktree', async () => {
    mockAgentActivityDisplayMode = 'full'
    const tabId = 'stale-worker-tab'
    const paneKey = makePaneKey(tabId, LEAF_A)
    mockAgents = [
      mockAgent({
        paneKey,
        tabId,
        agentType: 'gemini',
        prompt: 'Stale worker',
        worktreeId: 'wt-1'
      })
    ]
    mockAgentStatusByPaneKey = { [paneKey]: { worktreeId: 'wt-2' } }
    const { default: WorktreeCardAgents } = await import('./WorktreeCardAgents')

    renderToStaticMarkup(<WorktreeCardAgents worktreeId="wt-1" />)
    expect(capturedRowActivations).toHaveLength(1)
    capturedRowActivations[0].onActivate(tabId, paneKey)

    expect(activationMocks.activateAndRevealWorkspace).toHaveBeenCalledWith('wt-1', undefined)
    expect(activationMocks.activateTabAndFocusPane).not.toHaveBeenCalled()
    expect(staleAgentRowMocks.dismissStaleAgentRowByKey).toHaveBeenCalledWith(paneKey)
  })

  it('reveals the worktree and focuses a compact automation worker row hydrated during reveal', async () => {
    mockAgentActivityDisplayMode = 'compact'
    const tabId = 'compact-worker-tab'
    const paneKey = makePaneKey(tabId, LEAF_A)
    mockAgents = [
      mockAgent({
        paneKey,
        tabId,
        agentType: 'gemini',
        prompt: 'Compact worker',
        worktreeId: 'wt-1'
      })
    ]
    mockAgentStatusByPaneKey = { [paneKey]: { worktreeId: 'wt-1' } }
    // Why: compact rows share the same activation contract as full rows, so
    // this keeps the test pinned to reveal-time tab hydration.
    activationMocks.activateAndRevealWorkspace.mockImplementation(() => {
      mockTabsByWorktree = { 'wt-1': [{ id: tabId }] }
      return { primaryTabId: null }
    })
    const host = document.createElement('div')
    document.body.append(host)
    const root: Root = createRoot(host)
    const { default: WorktreeCardAgents } = await import('./WorktreeCardAgents')

    await act(async () => {
      root.render(
        <TooltipProvider>
          <WorktreeCardAgents worktreeId="wt-1" />
        </TooltipProvider>
      )
    })
    const row = host.querySelector('.compact-agent-row')
    expect(row).toBeInstanceOf(HTMLElement)

    await act(async () => {
      row?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(activationMocks.activateAndRevealWorkspace).toHaveBeenCalledWith('wt-1', undefined)
    expect(activationMocks.activateTabAndFocusPane).toHaveBeenCalledWith(tabId, LEAF_A, {
      ackPaneKeyOnSuccess: paneKey,
      flashFocusedPane: true,
      scrollToBottomIfOutputSinceLastView: true
    })
    act(() => root.unmount())
    host.remove()
  })
})
