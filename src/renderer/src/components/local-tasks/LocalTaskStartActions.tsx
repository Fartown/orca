import { ChevronDown, GitBranch, Link2, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import type { LocalTaskWorkspaceLink } from '../../../../shared/local-tasks/local-task-link-types'
import type { LocalTask, LocalTaskProject } from '../../../../shared/local-tasks/local-task-types'
import { localTaskLinkDialogStore } from '@/local-tasks/local-task-link-dialog-store'
import {
  runLocalTaskStart,
  useLocalTaskStartChoices,
  useLocalTaskStartState
} from '@/local-tasks/local-task-work-actions'
import { LocalTaskActionTooltip } from './LocalTaskActionTooltip'

/** Start work and Link an existing workspace for a task with no workspace of its own (REQ-009). */
export function LocalTaskStartActions({
  task,
  project,
  ownLink,
  writeReason,
  inherited
}: {
  task: LocalTask
  project: LocalTaskProject | undefined
  ownLink: LocalTaskWorkspaceLink | null
  /** Why the task's library takes no change now; it outranks Start's own reason. */
  writeReason: string | null
  /** The task works in an ancestor's workspace, so Start makes it one of its own. */
  inherited: boolean
}): React.JSX.Element {
  const start = useLocalTaskStartState(project, ownLink)
  const choices = useLocalTaskStartChoices(start.mode === 'create' ? project : undefined)
  const run = (orcaProjectId?: string): void => {
    if (project) {
      runLocalTaskStart(task, project, ownLink, orcaProjectId ? { orcaProjectId } : {})
    }
  }
  const startLabel = inherited
    ? translate('localTasks.links.startOwn', 'Start work separately')
    : translate('localTasks.links.start', 'Start work')
  const reason = writeReason ?? start.reason
  return (
    <div className="flex flex-wrap gap-1.5">
      {start.mode === 'create' ? (
        <span className="flex items-center gap-1">
          <LocalTaskActionTooltip
            reason={reason}
            label={
              choices[0]
                ? translate('localTasks.links.startIn', '{{action}} in {{repo}}', {
                    action: startLabel,
                    repo: choices[0].label
                  })
                : startLabel
            }
            shortcut={['I']}
          >
            <Button size="xs" disabled={reason !== null} onClick={() => run()}>
              <Play className="size-3" />
              {startLabel}
            </Button>
          </LocalTaskActionTooltip>
          {choices.length > 1 ? (
            <DropdownMenu>
              <LocalTaskActionTooltip reason={reason}>
                <DropdownMenuTrigger asChild disabled={reason !== null}>
                  <Button
                    variant="outline"
                    size="icon-xs"
                    aria-label={translate(
                      'localTasks.links.startInRepo',
                      'Start work in another repository'
                    )}
                  >
                    <ChevronDown className="size-3" />
                  </Button>
                </DropdownMenuTrigger>
              </LocalTaskActionTooltip>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>
                  {translate('localTasks.links.startInRepo', 'Start work in another repository')}
                </DropdownMenuLabel>
                {choices.map((choice) => (
                  <DropdownMenuItem
                    key={choice.orcaProjectId}
                    onSelect={() => run(choice.orcaProjectId)}
                  >
                    <GitBranch />
                    {choice.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </span>
      ) : null}
      <LocalTaskActionTooltip reason={writeReason}>
        <Button
          variant="outline"
          size="xs"
          disabled={writeReason !== null}
          onClick={() =>
            localTaskLinkDialogStore.getState().open({ kind: 'pick-workspace', taskId: task.id })
          }
        >
          <Link2 className="size-3" />
          {translate('localTasks.links.useExisting', 'Link an existing workspace')}
        </Button>
      </LocalTaskActionTooltip>
    </div>
  )
}
