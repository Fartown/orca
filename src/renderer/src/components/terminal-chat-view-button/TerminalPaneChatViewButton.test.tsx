/**
 * @vitest-environment happy-dom
 */
import { act, createRef, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isTerminalLeafId } from '../../../../shared/stable-pane-id'
import type { ManagedPane } from '@/lib/pane-manager/pane-manager'
import type { PtyTransport } from '../terminal-pane/pty-transport-types'
import TerminalPaneHeaderOverlay from '../terminal-pane/TerminalPaneHeaderOverlay'

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children?: ReactNode }) => children,
  TooltipTrigger: ({ children }: { children?: ReactNode }) => children,
  TooltipContent: ({ children }: { children?: ReactNode }) => <span>{children}</span>
}))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('@/store', () => {
  const getState = () => ({
    agentStatusByPaneKey: {},
    settings: { activeRuntimeEnvironmentId: null },
    repos: [],
    worktreesByRepo: {},
    detectedWorktreesByRepo: {},
    folderWorkspaces: [],
    sshConnectionStates: new Map()
  })
  return {
    useAppStore: Object.assign(
      <T,>(selector: (state: ReturnType<typeof getState>) => T) => selector(getState()),
      { getState }
    )
  }
})
vi.mock('../terminal-pane/TerminalPaneResumeInChatButton', () => ({
  TerminalPaneResumeInChatButton: () => null
}))

const mounted: { container: HTMLDivElement; root: Root }[] = []
afterEach(() => {
  for (const { container, root } of mounted.splice(0)) {
    act(() => root.unmount())
    container.remove()
  }
})

function makePane(id: number): ManagedPane {
  const leafId = `00000000-0000-4000-8000-00000000000${id}`
  if (!isTerminalLeafId(leafId)) {
    throw new Error('Invalid test leaf')
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the header reads ids and the pane container only.
  return {
    id,
    leafId,
    stablePaneId: leafId,
    container: document.createElement('div'),
    linkTooltip: document.createElement('div')
  } as unknown as ManagedPane
}

// The surface passes the toggle whenever the pane can flip either way, chat view included.
function renderHeader(canShowTerminal: boolean) {
  const onSwitchToChatView = vi.fn()
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      <TerminalPaneHeaderOverlay
        tabId="tab-1"
        worktreeId="wt-1"
        cwd="/tmp"
        showAlwaysOnHeaders
        isTabPinned={false}
        paneCount={2}
        activePaneId={1}
        panes={[makePane(1), makePane(2)]}
        paneTitles={{}}
        paneTitleOverlayRects={{
          1: { left: 0, top: 0, width: 200 },
          2: { left: 220, top: 0, width: 200 }
        }}
        renamingPaneId={null}
        renameValue=""
        renameInputRef={createRef<HTMLInputElement>()}
        titleUsesLightSurface={false}
        paneTitleBackground="transparent"
        terminalContentVisible
        hiddenStartupStyle={{}}
        managerRef={{ current: null }}
        paneTransportsRef={{ current: new Map<number, PtyTransport>() }}
        canShowTerminal={canShowTerminal}
        onShowTerminal={vi.fn()}
        onSwitchToChatView={onSwitchToChatView}
        onSplitPane={vi.fn()}
        onBeginPaneDrag={vi.fn()}
        onActivatePaneTitleInteraction={vi.fn()}
        onPaneTitleContextMenu={vi.fn()}
        onStartRename={vi.fn()}
        onRemoveTitle={vi.fn()}
        onClosePane={vi.fn()}
        onRenameValueChange={vi.fn()}
        onRenameSubmit={vi.fn()}
        onRenameCancel={vi.fn()}
        onRenameBlur={vi.fn()}
      />
    )
  })
  mounted.push({ container, root })
  return { container, onSwitchToChatView }
}

describe('terminal pane header chat view button', () => {
  it('offers one Switch to Chat View, on the active pane, that runs the pane toggle', () => {
    const { container, onSwitchToChatView } = renderHeader(false)
    const switches = container.querySelectorAll<HTMLButtonElement>(
      'button[aria-label="Switch to Chat View"]'
    )
    expect(switches).toHaveLength(1)
    expect(switches[0]?.closest('.pane-title-bar')?.hasAttribute('data-active-pane')).toBe(true)

    act(() => switches[0]?.click())
    expect(onSwitchToChatView).toHaveBeenCalledTimes(1)
  })

  it('stays hidden while the pane already shows chat view', () => {
    const { container } = renderHeader(true)
    expect(container.querySelector('button[aria-label="Switch to Chat View"]')).toBeNull()
  })
})
