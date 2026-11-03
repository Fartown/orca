import { MessageSquare, SquareTerminal } from 'lucide-react'
import { ContextMenuItem, ContextMenuShortcut } from '@/components/ui/context-menu'
import { translate } from '@/i18n/i18n'

export function TerminalTabViewSwitch({
  isChatView,
  onToggleViewMode,
  shortcut
}: {
  isChatView: boolean
  onToggleViewMode: () => void
  /** The remappable terminal.toggleNativeChat label; null when unbound. */
  shortcut: string | null
}): React.JSX.Element {
  return (
    <ContextMenuItem onSelect={onToggleViewMode}>
      {isChatView ? (
        <SquareTerminal className="size-3.5 shrink-0" />
      ) : (
        <MessageSquare className="size-3.5 shrink-0" />
      )}
      {isChatView
        ? translate(
            'components.tab.bar.SortableTabContextMenu.switchToTerminalView',
            'Continue with Terminal Agent'
          )
        : translate('terminalChatViewButton.switchToChatView', 'Switch to Chat View')}
      {shortcut ? <ContextMenuShortcut>{shortcut}</ContextMenuShortcut> : null}
    </ContextMenuItem>
  )
}
