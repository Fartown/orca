import { SidebarGroupByToggle } from '@/components/sidebar/SidebarGroupByToggle'
import { translate } from '@/i18n/i18n'
import {
  chooseLocalTaskSidebarGrouping,
  useLocalTaskSidebarGrouping
} from '@/local-tasks/local-task-sidebar-grouping'
import type { WorktreeGroupBy } from '../../../../shared/sidebar-list/row-types'

const TASK_GROUPING = 'local-task'

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
  return (
    <SidebarGroupByToggle
      groupBy={groupBy}
      setGroupBy={(next) => {
        chooseLocalTaskSidebarGrouping(false)
        setGroupBy(next)
      }}
      extraChoices={[
        {
          id: TASK_GROUPING,
          label: translate('localTasks.sidebar.groupByTask', 'Task'),
          choose: () => chooseLocalTaskSidebarGrouping(true)
        }
      ]}
      selectedExtraId={grouping === 'on' ? TASK_GROUPING : undefined}
    />
  )
}
