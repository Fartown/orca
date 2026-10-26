import type { ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { LOCAL_TASK_PAGE_ATTRIBUTE } from '@/local-tasks/local-task-page-keys'
import { isLocalTasksReadable, useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { localTaskPageStore, useLocalTaskPage } from '@/local-tasks/local-task-page-store'
import { LocalTaskHostStatePanel, LocalTaskReadOnlyNotice } from './LocalTaskHostStatePanel'
import { LocalTaskBootstrap } from './LocalTaskBootstrap'
import { LocalTaskNav } from './LocalTaskNav'
import { LocalTaskToolbar } from './LocalTaskToolbar'
import { LocalTaskList } from './LocalTaskList'
import { LocalTaskBoard } from './LocalTaskBoard'
import { LocalTaskBatchBar } from './LocalTaskBatchBar'
import { LocalTaskPreview } from './LocalTaskPreview'
import { LocalTaskDetail } from './LocalTaskDetail'
import { LocalTaskCreateDialog } from './LocalTaskCreateDialog'
import { LocalTaskQuickPicker } from './LocalTaskQuickPicker'
import { LocalTaskKeyHints } from './LocalTaskKeyHints'
import { useLocalTaskListModel, type LocalTaskListModel } from './use-local-task-list-model'
import { useLocalTaskEscapeLayer, useLocalTaskPageKeys } from './use-local-task-page-keys'

/** The task page's Local source: rail, list or board, and task detail (REQ-006, REQ-008). */
export function LocalTaskPage({ sourceBar }: { sourceBar: ReactNode }): React.JSX.Element {
  const readable = useLocalTasksDomain(isLocalTasksReadable)
  const loaded = useLocalTasksDomain((state) => state.projectsLoaded && state.tasksLoaded)
  const hasProjects = useLocalTasksDomain((state) => state.projects.length > 0)
  const detailTaskId = useLocalTaskPage((state) => state.detailTaskId)
  const model = useLocalTaskListModel()
  const ready = readable && loaded && hasProjects
  useLocalTaskPageKeys(model, ready)

  let body: ReactNode
  if (!readable) {
    body = <LocalTaskHostStatePanel />
  } else if (!loaded) {
    body = (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
        {translate('localTasks.page.loading', 'Loading tasks…')}
      </div>
    )
  } else if (!hasProjects) {
    body = <LocalTaskBootstrap />
  } else if (detailTaskId) {
    body = <LocalTaskDetail taskId={detailTaskId} model={model} />
  } else {
    body = <LocalTaskOverview model={model} />
  }

  return (
    <div
      {...{ [LOCAL_TASK_PAGE_ATTRIBUTE]: '' }}
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-2"
    >
      {detailTaskId && ready ? null : sourceBar}
      <LocalTaskReadOnlyNotice />
      {body}
      {ready ? <LocalTaskCreateDialog /> : null}
      {ready ? <LocalTaskQuickPicker /> : null}
    </div>
  )
}

function LocalTaskOverview({ model }: { model: LocalTaskListModel }): React.JSX.Element {
  const previewOpen = useLocalTaskPage((state) => state.previewOpen)
  const cursorTaskId = useLocalTaskPage((state) => state.cursorTaskId)
  const hasSelection = useLocalTaskPage((state) => state.selectedTaskIds.length > 0)
  const previewTask =
    previewOpen && cursorTaskId ? model.index.tasksById.get(cursorTaskId) : undefined
  useLocalTaskEscapeLayer('panel', hasSelection, () =>
    localTaskPageStore.getState().clearSelection()
  )
  useLocalTaskEscapeLayer('panel', previewTask !== undefined, () =>
    localTaskPageStore.getState().setPreviewOpen(false)
  )
  return (
    <div className="flex min-h-0 flex-1 gap-4 pt-2">
      <LocalTaskNav model={model} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        <LocalTaskToolbar model={model} />
        {hasSelection ? <LocalTaskBatchBar model={model} /> : null}
        {model.layout === 'list' ? (
          <LocalTaskList model={model} />
        ) : (
          <LocalTaskBoard model={model} />
        )}
        <LocalTaskKeyHints />
      </div>
      {previewTask ? <LocalTaskPreview task={previewTask} index={model.index} /> : null}
    </div>
  )
}
