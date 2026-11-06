import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'

/**
 * A control's tooltip that still opens while the control is greyed: then it says why, instead of
 * naming the action and a shortcut that would do nothing. No label and no reason, no tooltip.
 */
export function LocalTaskActionTooltip({
  reason,
  label = null,
  shortcut,
  side = 'bottom',
  wrapperClassName = 'inline-flex',
  children
}: {
  reason: string | null
  label?: string | null
  shortcut?: string[]
  side?: 'top' | 'bottom' | 'left' | 'right'
  /** The greyed control's wrapper; a full-width trigger needs it to stay full width. */
  wrapperClassName?: string
  children: React.ReactElement
}): React.JSX.Element {
  if (!reason && !label) {
    return children
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {reason ? (
          // Why the span: a disabled button takes no pointer or focus events, so its tooltip never opens.
          <span tabIndex={0} aria-label={reason} className={wrapperClassName}>
            {children}
          </span>
        ) : (
          children
        )}
      </TooltipTrigger>
      <TooltipContent side={side} sideOffset={4}>
        <span className="flex items-center gap-2">
          {reason ?? label}
          {reason || !shortcut ? null : <ShortcutKeyCombo keys={shortcut} />}
        </span>
      </TooltipContent>
    </Tooltip>
  )
}
