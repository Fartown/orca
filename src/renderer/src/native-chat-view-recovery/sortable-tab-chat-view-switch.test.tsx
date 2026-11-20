/**
 * @vitest-environment happy-dom
 */
import { act, type ComponentProps, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SortableTabContextMenu } from '@/components/tab-bar/terminal-tabs/SortableTabContextMenu'

const storeState = vi.hoisted(() => ({ keybindings: {} }) as Record<string, unknown>)

vi.mock('@/lib/keyboard/useShortcutLabel', () => ({
  formatShortcutLabel: () => '⌘D',
  useOptionalShortcutLabel: () => '⌘D'
}))

vi.mock('@/components/ui/context-menu', () => ({
  ContextMenuContent: ({ children }: { children?: ReactNode }) => children,
  ContextMenuItem: ({
    children,
    disabled,
    onSelect
  }: {
    children?: ReactNode
    disabled?: boolean
    onSelect?: () => void
  }) => (
    <button type="button" disabled={disabled} onClick={() => onSelect?.()}>
      {children}
    </button>
  ),
  ContextMenuSeparator: () => null,
  ContextMenuShortcut: ({ children }: { children?: ReactNode }) => children
}))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

vi.mock('@/i18n/use-translate', () => ({
  useTranslate: () => (_key: string, fallback: string) => fallback
}))

vi.mock('@/store/index', () => ({
  useAppStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) => selector(storeState),
    { getState: () => storeState }
  )
}))

vi.mock('@/components/tab-bar/terminal-tabs/use-allow-auto-close', () => ({
  useAllowAutoClose: () => undefined
}))
vi.mock('@/components/tab-bar/pane-actions/TerminalTabSplitMenuSection', () => ({
  TerminalTabSplitMenuSection: () => null
}))
vi.mock('@/components/tab-bar/pane-actions/CopyTabIdMenuItem', () => ({
  CopyTabIdMenuItem: () => null
}))
vi.mock('@/components/tab-bar/pane-actions/CloseSplitPaneMenuItem', () => ({
  CloseSplitPaneMenuItem: () => null
}))
vi.mock('@/components/tab-bar/session-actions/TabSessionSurfaceSwitchMenuItems', () => ({
  TabSessionSurfaceSwitchMenuItems: ({ leadingSeparator }: { leadingSeparator: boolean }) => (
    <div data-testid="session-surface-switch" data-leading-separator={String(leadingSeparator)} />
  )
}))

const mounted: { container: HTMLDivElement; root: Root }[] = []

function renderMenu(overrides: Partial<ComponentProps<typeof SortableTabContextMenu>> = {}): {
  container: HTMLDivElement
  onActivate: ReturnType<typeof vi.fn>
} {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const onActivate = vi.fn()
  act(() => {
    root.render(
      <SortableTabContextMenu
        open
        tab={{ id: 'term-1', worktreeId: 'wt-1', color: null }}
        unifiedTabId="tab-1"
        groupId="group-1"
        isActive
        tabCount={2}
        hasTabsToRight
        hasTabsToLeft
        isPinned={false}
        onActivate={onActivate}
        onClose={vi.fn()}
        onCloseOthers={vi.fn()}
        onCloseToRight={vi.fn()}
        onCloseToLeft={vi.fn()}
        onRenameOpen={vi.fn()}
        onSetTabColor={vi.fn()}
        onTogglePin={vi.fn()}
        {...overrides}
      />
    )
  })
  mounted.push({ container, root })
  return { container, onActivate }
}

function getButton(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(label)
  )
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Missing button: ${label}`)
  }
  return button
}

function getSurfaceSwitchMarker(container: HTMLElement): Element {
  const marker = container.querySelector('[data-testid="session-surface-switch"]')
  if (!marker) {
    throw new Error('Missing session surface switch items')
  }
  return marker
}

afterEach(() => {
  for (const { container, root } of mounted.splice(0)) {
    act(() => root.unmount())
    container.remove()
  }
})

// Ported from the upstream SortableTabContextMenu suite that upstream retired as low-value (#38310).
describe('terminal tab chat view switch', () => {
  it('switches an eligible terminal tab into chat view through its existing callback', () => {
    const onToggleViewMode = vi.fn()
    const onClose = vi.fn()
    const { container, onActivate } = renderMenu({
      canToggleViewMode: true,
      onToggleViewMode,
      onClose
    })
    const marker = getSurfaceSwitchMarker(container)

    expect(getButton(container, 'Switch to Chat View').compareDocumentPosition(marker)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    )
    expect(marker.getAttribute('data-leading-separator')).toBe('false')
    act(() => getButton(container, 'Switch to Chat View').click())
    expect(onToggleViewMode).toHaveBeenCalledExactlyOnceWith()
    expect(onActivate).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('keeps the way back for a tab already in chat view', () => {
    const onToggleViewMode = vi.fn()
    const { container } = renderMenu({
      canToggleViewMode: true,
      isChatView: true,
      onToggleViewMode
    })

    expect(container.textContent).not.toContain('Switch to Chat View')
    act(() => getButton(container, 'Continue in terminal').click())
    expect(onToggleViewMode).toHaveBeenCalledExactlyOnceWith()
  })

  it.each([{ canToggleViewMode: true }, { canToggleViewMode: false, onToggleViewMode: vi.fn() }])(
    'hides an unavailable view switch: %j',
    (props) => {
      const { container } = renderMenu(props)

      expect(container.textContent).not.toContain('Switch to Chat View')
      expect(container.textContent).not.toContain('Continue in terminal')
      expect(getSurfaceSwitchMarker(container).getAttribute('data-leading-separator')).toBe('true')
    }
  )
})
