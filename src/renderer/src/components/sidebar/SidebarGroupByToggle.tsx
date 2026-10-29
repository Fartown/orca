import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { WorktreeGroupBy } from '../../../../shared/sidebar-list/row-types'
import { GROUP_BY_OPTIONS } from './sidebar-workspace-option-items'

/** A choice a feature adds after the grouping options; it decides what choosing it means. */
export type SidebarGroupByExtraChoice = { id: string; label: string; choose: () => void }

const NO_EXTRA_CHOICES: readonly SidebarGroupByExtraChoice[] = []

type SidebarGroupByToggleProps = {
  groupBy: WorktreeGroupBy
  setGroupBy: (groupBy: WorktreeGroupBy) => void
  extraChoices?: readonly SidebarGroupByExtraChoice[]
  /** An extra choice shown as selected in place of `groupBy`. */
  selectedExtraId?: string
}

export function SidebarGroupByToggle({
  groupBy,
  setGroupBy,
  extraChoices = NO_EXTRA_CHOICES,
  selectedExtraId
}: SidebarGroupByToggleProps) {
  const choices = [
    ...GROUP_BY_OPTIONS.map((option) => ({ ...option, choose: () => setGroupBy(option.id) })),
    ...extraChoices
  ]
  return (
    <ToggleGroup
      type="single"
      value={selectedExtraId ?? groupBy}
      onValueChange={(value) => {
        if (value) {
          choices.find((option) => option.id === value)?.choose()
        }
      }}
      variant="outline"
      size="sm"
      className="h-6 w-full justify-stretch"
    >
      {choices.map((option) => (
        <ToggleGroupItem
          key={option.id}
          value={option.id}
          // Why: inside the dropdown menu, Radix can focus a toggle item without
          // committing ToggleGroup's value change; capture the pointer intent
          // before the menu's roving-focus handling turns it into a no-op.
          onPointerDownCapture={option.choose}
          className="h-6 grow basis-0 px-1 text-[10px] data-[state=on]:bg-foreground/10 data-[state=on]:font-semibold data-[state=on]:text-foreground"
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
