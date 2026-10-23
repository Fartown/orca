import { MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'
import { isMacPlatform } from '@/components/native-chat/native-chat-shortcut'
import { switchToChatViewLabel } from './chat-surface-labels'

export function TerminalPaneChatViewButton({
  onSwitch
}: {
  onSwitch: () => void
}): React.JSX.Element {
  const label = switchToChatViewLabel()
  const isMac = isMacPlatform()
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          // Same class as split so it shares the hover/active reveal.
          className="pane-title-split-trigger"
          aria-label={label}
          onClick={(event) => {
            event.stopPropagation()
            onSwitch()
          }}
        >
          <MessageSquare className="size-3" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        {label}
        <ShortcutKeyCombo
          keys={[isMac ? '⌘' : 'Ctrl', isMac ? '⇧' : 'Shift', 'J']}
          className="ml-1.5"
        />
      </TooltipContent>
    </Tooltip>
  )
}
