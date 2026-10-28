import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { SidebarGroupByToggle } from '@/components/sidebar/SidebarGroupByToggle'
import { GROUP_BY_OPTIONS } from '@/components/sidebar/sidebar-workspace-option-items'
import { translate } from '@/i18n/i18n'
import {
  chooseLocalTaskSidebarGrouping,
  useLocalTaskSidebarGrouping
} from '@/local-tasks/local-task-sidebar-grouping'
import type { WorktreeGroupBy } from '../../../../shared/sidebar-list/row-types'

const TASK_GROUPING = 'local-task'
const ITEM_CLASS_NAME = 'grow basis-0'

type Props = {
  groupBy: WorktreeGroupBy
  setGroupBy: (groupBy: WorktreeGroupBy) => void
}

/** Upstream's grouping toggle plus "Task"; without a loaded task library it is upstream's alone. */
export function LocalTaskSidebarGroupByToggle({ groupBy, setGroupBy }: Props): React.JSX.Element {
  const grouping = useLocalTaskSidebarGrouping()
  if (grouping === 'unavailable') {
    return <SidebarGroupByToggle groupBy={groupBy} setGroupBy={setGroupBy} />
  }
  const choose = (value: string): void => {
    if (value === TASK_GROUPING) {
      chooseLocalTaskSidebarGrouping(true)
      return
    }
    const option = GROUP_BY_OPTIONS.find((candidate) => candidate.id === value)
    if (option) {
      chooseLocalTaskSidebarGrouping(false)
      setGroupBy(option.id)
    }
  }
  return (
    <ToggleGroup
      type="single"
      value={grouping === 'on' ? TASK_GROUPING : groupBy}
      onValueChange={(value) => {
        if (value) {
          choose(value)
        }
      }}
      variant="outline"
      size="sm"
      className="h-6 w-full justify-stretch"
    >
      {GROUP_BY_OPTIONS.map((option) => (
        <ToggleGroupItem
          key={option.id}
          value={option.id}
          // Why: same as upstream, Radix in a menu can move focus without committing the value.
          onPointerDownCapture={() => choose(option.id)}
          className={ITEM_CLASS_NAME}
        >
          {option.label}
        </ToggleGroupItem>
      ))}
      <ToggleGroupItem
        value={TASK_GROUPING}
        onPointerDownCapture={() => choose(TASK_GROUPING)}
        className={ITEM_CLASS_NAME}
      >
        {translate('localTasks.sidebar.groupByTask', 'Task')}
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
