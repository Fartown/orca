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
  return (
    <Card size="sm" className={cn('gap-0 px-5 py-4', className)}>
      {children}
    </Card>
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
        <ToggleGroupItem key={option.value} value={option.value} className="data-[size=xs]:px-3">
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
