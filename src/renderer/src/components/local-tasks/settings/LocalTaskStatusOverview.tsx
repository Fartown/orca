import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'
import type { LocalTaskProject } from '../../../../../shared/local-tasks/local-task-types'
import { LocalTaskStatusIcon } from '../LocalTaskIcons'
import { LocalTaskStatusSettings, useLocalTaskStatusUsage } from './LocalTaskStatusSettings'

/** A project's statuses as chips with task counts; the full editor opens in a dialog. */
export function LocalTaskStatusOverview({
  project,
  writable
}: {
  project: LocalTaskProject
  writable: boolean
}): React.JSX.Element {
  const usage = useLocalTaskStatusUsage()
  const [managing, setManaging] = useState(false)
  return (
    <div className="space-y-2">
      <Label className="flex-wrap gap-1.5">
        {translate('localTasks.settings.statusesTitle', 'Statuses')}
        <span className="text-2xs font-normal text-muted-foreground">
          {translate(
            'localTasks.settings.statusesSummary',
            '· Six fixed categories; a status never changes category'
          )}
        </span>
      </Label>
      <ul className="flex flex-wrap gap-1.5">
        {project.statuses.map((status) => (
          <li
            key={status.id}
            className="flex h-6 items-center gap-1.5 rounded-full border border-border/60 px-2.5 text-xs text-foreground"
          >
            <LocalTaskStatusIcon
              category={status.category}
              color={status.color}
              className="size-3"
            />
            {status.name}
            <span className="text-2xs text-muted-foreground tabular-nums">
              {usage.get(status.id) ?? 0}
            </span>
          </li>
        ))}
      </ul>
      <Button
        variant="link"
        size="xs"
        className="h-auto px-0 text-foreground underline decoration-border underline-offset-4 has-[>svg]:px-0"
        onClick={() => setManaging(true)}
      >
        <Pencil />
        {translate('localTasks.settings.manageStatuses', 'Manage statuses')}
      </Button>
      <Dialog open={managing} onOpenChange={setManaging}>
        <DialogContent scrollable className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {translate('localTasks.settings.manageStatusesTitle', 'Statuses of {{project}}', {
                project: project.name
              })}
            </DialogTitle>
            <DialogDescription>
              {translate(
                'localTasks.settings.statusesHelp',
                'The six categories are fixed. A status never changes category, and each category keeps at least one. Board columns are these statuses.'
              )}
            </DialogDescription>
          </DialogHeader>
          <LocalTaskStatusSettings project={project} writable={writable} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
