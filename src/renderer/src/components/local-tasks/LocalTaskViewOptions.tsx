import { ArrowDownUp, Rows3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import {
  LOCAL_TASK_GROUP_BYS,
  LOCAL_TASK_SORT_BYS,
  useLocalTaskPage,
  type LocalTaskGroupBy,
  type LocalTaskSortBy
} from '@/local-tasks/local-task-page-store'
import {
  chooseLocalTaskGroupBy,
  chooseLocalTaskSortBy
} from '@/local-tasks/local-task-view-preferences'

function groupByLabel(groupBy: LocalTaskGroupBy): string {
  switch (groupBy) {
    case 'status':
      return translate('localTasks.view.groupStatus', 'Status')
    case 'priority':
      return translate('localTasks.view.groupPriority', 'Priority')
    case 'project':
      return translate('localTasks.view.groupProject', 'Project')
    case 'none':
      return translate('localTasks.view.groupNone', 'No grouping')
  }
}

function sortByLabel(sortBy: LocalTaskSortBy): string {
  switch (sortBy) {
    case 'updated':
      return translate('localTasks.view.sortUpdated', 'Last updated')
    case 'created':
      return translate('localTasks.view.sortCreated', 'Created')
    case 'priority':
      return translate('localTasks.view.sortPriority', 'Priority')
    case 'number':
      return translate('localTasks.view.sortNumber', 'Ref number')
  }
}

/** A toolbar menu button whose label folds into its icon on a narrow toolbar. */
function OptionTrigger({
  icon,
  label
}: {
  icon: React.ReactNode
  label: string
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="shrink-0" aria-label={label}>
            {icon}
            <span className="hidden @5xl/local-task-toolbar:inline">{label}</span>
          </Button>
        </DropdownMenuTrigger>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

/** Grouping (list only; board columns are statuses) and sort order (both), REQ-006. */
export function LocalTaskViewOptions(): React.JSX.Element {
  const layout = useLocalTaskPage((state) => state.layout)
  const groupBy = useLocalTaskPage((state) => state.groupBy)
  const sortBy = useLocalTaskPage((state) => state.sortBy)
  return (
    <>
      {layout === 'list' ? (
        <DropdownMenu>
          <OptionTrigger
            icon={<Rows3 />}
            label={translate('localTasks.view.groupTrigger', 'Group: {{choice}}', {
              choice: groupByLabel(groupBy)
            })}
          />
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>
              {translate('localTasks.view.groupBy', 'Group by')}
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={groupBy}
              onValueChange={(value) => {
                const next = LOCAL_TASK_GROUP_BYS.find((option) => option === value)
                if (next) {
                  chooseLocalTaskGroupBy(next)
                }
              }}
            >
              {LOCAL_TASK_GROUP_BYS.map((option) => (
                <DropdownMenuRadioItem key={option} value={option}>
                  {groupByLabel(option)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <DropdownMenu>
        <OptionTrigger
          icon={<ArrowDownUp />}
          label={translate('localTasks.view.sortTrigger', 'Sort: {{choice}}', {
            choice: sortByLabel(sortBy)
          })}
        />
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>{translate('localTasks.view.sortBy', 'Sort by')}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={sortBy}
            onValueChange={(value) => {
              const next = LOCAL_TASK_SORT_BYS.find((option) => option === value)
              if (next) {
                chooseLocalTaskSortBy(next)
              }
            }}
          >
            {LOCAL_TASK_SORT_BYS.map((option) => (
              <DropdownMenuRadioItem key={option} value={option}>
                {sortByLabel(option)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
