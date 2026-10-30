import { ListTodo } from 'lucide-react'
import { CommandItem } from '@/components/ui/command'
import type { WorktreeJumpPaletteController } from '@/components/use-worktree-jump-palette-controller'
import { translate } from '@/i18n/i18n'
import type { LocalTaskPaletteItem } from '@/local-tasks/local-task-palette-items'
import { LocalTaskStatusIcon } from './LocalTaskIcons'

/** Upstream's task row with the title in front: the ref is the small gray prefix (REQ-007). */
export function LocalTaskPaletteRow({
  entry,
  renderKey,
  controller
}: {
  entry: LocalTaskPaletteItem
  renderKey: string
  controller: WorktreeJumpPaletteController
}): React.JSX.Element {
  const context = [
    translate('localTasks.palette.source', 'Local task'),
    entry.projectName,
    entry.hostLabel,
    entry.status?.name,
    // Why last: the status before it is only what was read before the host went out of contact.
    entry.unverifiable ? translate('localTasks.links.state.unverifiable', 'Can’t confirm') : null
  ].filter(Boolean)
  return (
    <CommandItem
      value={renderKey}
      onSelect={() => controller.handleSelectItem(entry)}
      selection="palette"
      className="group mx-0.5 cursor-pointer text-left"
    >
      <div className="flex w-full min-w-0 items-center gap-3 py-1">
        {entry.status ? (
          <LocalTaskStatusIcon category={entry.status.category} color={entry.status.color} />
        ) : (
          <ListTodo className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-xs text-muted-foreground">{entry.task.ref}</span>
            <span className="truncate text-[14px] font-semibold text-foreground">
              {entry.task.title}
            </span>
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground">{context.join(' · ')}</div>
        </div>
      </div>
    </CommandItem>
  )
}
