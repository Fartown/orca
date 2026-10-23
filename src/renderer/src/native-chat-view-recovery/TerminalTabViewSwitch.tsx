import { MessageSquare, SquareTerminal } from 'lucide-react'
import { DropdownMenuItem, DropdownMenuShortcut } from '@/components/ui/dropdown-menu'
import {
  isMacPlatform,
  nativeChatToggleShortcutLabel
} from '@/components/native-chat/native-chat-shortcut'
import { translate } from '@/i18n/i18n'

export function TerminalTabViewSwitch({
  isChatView,
  onToggleViewMode
}: {
  isChatView: boolean
  onToggleViewMode: () => void
}): React.JSX.Element {
  const shortcut = nativeChatToggleShortcutLabel(isMacPlatform())
  return (
    <DropdownMenuItem onSelect={onToggleViewMode}>
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
      <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>
    </DropdownMenuItem>
  )
}
