// @vitest-environment happy-dom

import { acceptedAgentStatuses } from '@/store/slices/agent-status/status-ownership/accepted-agent-statuses'
import { DndContext } from '@dnd-kit/core'
import { SortableContext } from '@dnd-kit/sortable'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { TabDragItemData } from '../components/tab-group/drag/tab-drag-data'
import SortableTab from '../components/tab-bar/terminal-tabs/SortableTab'
import type { SessionTabTitleModel } from './use-session-tab-titles'

vi.mock('@/store', async () => {
  const { create } = await import('zustand')
  return {
    useAppStore: create(() => ({
      settings: null,
      unreadTerminalTabs: {},
      unreadAgentCompletionPanes: {},
      agentStatusByPaneKey: acceptedAgentStatuses(),
      agentStatusEpoch: 0,
      runtimePaneTitlesByTabId: {},
      ptyIdsByTabId: {},
      terminalLayoutsByTabId: {},
      keybindings: {}
    }))
  }
})
vi.mock('../components/tab-bar/terminal-tabs/SortableTabContextMenu', () => ({
  SortableTabContextMenu: () => null
}))
vi.mock('../components/terminal/shells/ShellIcon', () => ({ ShellIcon: () => <span /> }))
vi.mock('@/lib/agent-catalog/agent-catalog', () => ({
  AgentIcon: () => <span />,
  getAgentLabel: (agent: string) => agent
}))

const dragData: TabDragItemData = {
  kind: 'tab',
  worktreeId: 'wt-1',
  groupId: 'group-1',
  unifiedTabId: 'terminal-1',
  visibleTabId: 'terminal-1',
  tabType: 'terminal',
  label: 'terminal-1'
}

function renderTab(tab: SessionTabTitleModel, agent: 'claude' | 'codex' | null): HTMLElement {
  render(
    <TooltipProvider>
      <DndContext>
        <SortableContext items={['terminal-1']}>
          <SortableTab
            tab={tab}
            agent={agent}
            unifiedTabId="terminal-1"
            groupId="group-1"
            tabCount={1}
            hasTabsToRight={false}
            hasTabsToLeft={false}
            isActive
            isPinned={false}
            isExpanded={false}
            onActivate={vi.fn()}
            onClose={vi.fn()}
            onCloseOthers={vi.fn()}
            onCloseToRight={vi.fn()}
            onCloseToLeft={vi.fn()}
            onSetCustomTitle={vi.fn()}
            onSetTabColor={vi.fn()}
            onTogglePin={vi.fn()}
            onToggleExpand={vi.fn()}
            dragData={dragData}
            dropIndicator={null}
          />
        </SortableContext>
      </DndContext>
    </TooltipProvider>
  )
  return screen.getByTestId('sortable-tab')
}

afterEach(cleanup)

describe('sortable tab session title', () => {
  // A manual rename outranks the Provider name; without one the native title keeps its glyph.
  it.each([
    { agent: null, customTitle: 'Custom terminal title', expectedTitle: 'Custom terminal title' },
    {
      agent: 'codex',
      customTitle: 'Custom terminal title',
      expectedTitle: 'Custom terminal title'
    },
    { agent: 'codex', customTitle: null, expectedTitle: '✳ Provider name' }
  ] as const)(
    'uses the shared title for the label and tab title ($agent: $expectedTitle)',
    ({ agent, customTitle, expectedTitle }) => {
      const tab = renderTab(
        {
          id: 'terminal-1',
          worktreeId: 'wt-1',
          title: 'Runtime terminal title',
          customTitle,
          color: null,
          aiVaultTitle: agent
            ? {
                agent,
                sessionId: 'session-a',
                title: 'Stale scanner fallback',
                source: 'provider',
                providerName: {
                  kind: 'named',
                  title: '✳ Provider name',
                  field: 'test.nativeName'
                }
              }
            : null
        },
        agent
      )

      expect(tab.getAttribute('data-tab-title')).toBe(expectedTitle)
      expect(tab.textContent).toContain(expectedTitle)
      expect(tab.textContent).not.toContain('Runtime terminal title')
      expect(tab.textContent).not.toContain('Stale scanner fallback')
      if (agent) {
        expect(tab.textContent).not.toContain(
          customTitle ? 'Provider name' : 'Custom terminal title'
        )
      }
    }
  )

  it("strips the agent's leading status glyph from a live title label", () => {
    const tab = renderTab(
      {
        id: 'terminal-1',
        worktreeId: 'wt-1',
        title: '✳ Claude Code',
        customTitle: null,
        color: null
      },
      'claude'
    )

    expect(tab.textContent).toContain('Claude Code')
    expect(tab.textContent).not.toContain('✳')
  })
})
