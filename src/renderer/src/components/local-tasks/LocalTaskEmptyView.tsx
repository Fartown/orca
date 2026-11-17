import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { EMPTY_LOCAL_TASK_FILTERS, localTaskPageStore } from '@/local-tasks/local-task-page-store'
import { useCanCreateLocalTask } from '@/local-tasks/local-task-write-access'

export function LocalTaskEmptyView({
  hasTasks,
  scopeProjectId
}: {
  hasTasks: boolean
  scopeProjectId: string | null
}): React.JSX.Element {
  const writable = useCanCreateLocalTask(scopeProjectId)
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
      {hasTasks ? (
        <>
          {translate('localTasks.list.noMatches', 'No tasks match this view.')}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const page = localTaskPageStore.getState()
              page.setFilters(EMPTY_LOCAL_TASK_FILTERS)
              page.setQuery('')
              page.setView('all')
            }}
          >
            {translate('localTasks.list.showAll', 'Show all tasks')}
          </Button>
        </>
      ) : (
        <>
          {translate('localTasks.list.empty', 'No tasks yet. Press C to write down the first one.')}
          {writable ? (
            <Button
              size="sm"
              onClick={() =>
                localTaskPageStore.getState().openCreate({ projectId: scopeProjectId })
              }
            >
              <Plus className="size-3.5" />
              {translate('localTasks.toolbar.newTask', 'New task')}
            </Button>
          ) : null}
        </>
      )}
    </div>
  )
}
