import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

/** One card of the Local tasks settings page; the section body around the cards is transparent. */
export function LocalTaskSettingsCard({
  className,
  children
}: {
  className?: string
  children: React.ReactNode
}): React.JSX.Element {
  // Why py-1.5: with Card sm's own py-2.5 the body sits 1rem from the card's edge.
  return (
    <Card size="sm">
      <div className={cn('flex flex-col px-5 py-1.5', className)}>{children}</div>
    </Card>
  )
}

/** An underlined text action under a setting, e.g. opening a preview or an editor. */
export function LocalTaskSettingsLinkButton({
  onClick,
  children
}: {
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-1 rounded-md text-xs font-medium whitespace-nowrap text-foreground underline decoration-border underline-offset-4 transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3"
    >
      {children}
    </button>
  )
}

/** Title and explanation on the left, the control on the right (or below when `stacked`). */
export function LocalTaskSettingsRow({
  controlId,
  title,
  description,
  extra,
  control,
  stacked = false
}: {
  controlId?: string
  title: React.ReactNode
  description: React.ReactNode
  extra?: React.ReactNode
  control: React.ReactNode
  stacked?: boolean
}): React.JSX.Element {
  return (
    <div className={cn('flex gap-6 py-3', stacked ? 'flex-col gap-2' : 'items-center')}>
      <div className="min-w-0 flex-1 space-y-1">
        <Label htmlFor={controlId} className="select-text">
          {title}
        </Label>
        <p className="text-xs leading-relaxed text-muted-foreground select-text">{description}</p>
        {extra}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  )
}

export function LocalTaskSettingsSegment<T extends string>({
  value,
  options,
  onChange,
  disabled,
  ariaLabel
}: {
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  disabled?: boolean
  ariaLabel: string
}): React.JSX.Element {
  return (
    <ToggleGroup
      type="single"
      variant="segmented-card"
      size="xs"
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onValueChange={(next) => {
        // Why: clicking the chosen option sends an empty value; the choice must stay set.
        const option = options.find((candidate) => candidate.value === next)
        if (option && option.value !== value) {
          onChange(option.value)
        }
      }}
      className="flex w-fit"
    >
      {options.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value}>
          <span className="px-1">{option.label}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
