import { useState, type ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { LOCAL_TASK_PAGE_ATTRIBUTE } from '@/local-tasks/local-task-page-keys'
import {
  isLocalTasksReadable,
  localTasksDomainStore,
  useLocalTasksDomain
} from '@/local-tasks/local-tasks-domain-store'
import { localTaskPageStore, useLocalTaskPage } from '@/local-tasks/local-task-page-store'
import { useLocalTaskLibraryViewer } from '@/local-tasks/local-task-library-viewers'
import {
  LocalTaskHostStatePanel,
  LocalTaskLibraryNotices,
  LocalTaskReadErrorPanel,
  LocalTaskReadOnlyNotice,
  refreshHomeLibrary
} from './LocalTaskHostStatePanel'
import { LocalTaskBootstrap } from './LocalTaskBootstrap'
import { LocalTaskNav, LocalTaskScopeMenu } from './LocalTaskNav'
import { LocalTaskToolbar } from './LocalTaskToolbar'
import { LocalTaskList } from './LocalTaskList'
import { LocalTaskBoard } from './LocalTaskBoard'
import { LocalTaskBatchBar } from './LocalTaskBatchBar'
import { LocalTaskPreview } from './LocalTaskPreview'
import { LocalTaskDetail } from './LocalTaskDetail'
import { LocalTaskCreateDialog } from './LocalTaskCreateDialog'
import { LocalTaskQuickPicker } from './LocalTaskQuickPicker'
import { LocalTaskLinkDialogHost } from './LocalTaskLinkDialogHost'
import { LocalTaskKeyHints } from './LocalTaskKeyHints'
import { LocalTaskNeedsYouView } from './LocalTaskNeedsYouView'
import { useLocalTaskListModel, type LocalTaskListModel } from './use-local-task-list-model'
import { useLocalTaskEscapeLayer, useLocalTaskPageKeys } from './use-local-task-page-keys'

/** The task page's Local source: rail, list or board, and task detail (REQ-006, REQ-008). */
export function LocalTaskPage({ sourceBar }: { sourceBar: ReactNode }): React.JSX.Element {
  useLocalTaskLibraryViewer()
  const connection = useLocalTasksDomain((state) => state.connection)
  const readable = useLocalTasksDomain(isLocalTasksReadable)
  const hostState = useLocalTasksDomain((state) => state.hostState)
  const loaded = useLocalTasksDomain((state) => state.projectsLoaded && state.tasksLoaded)
  const hasProjects = useLocalTasksDomain((state) => state.projects.length > 0)
  const readError = useLocalTasksDomain(
    (state) =>
      state.readErrors.status ??
      state.readErrors.projects ??
      state.readErrors.tasks ??
      state.readErrors.preferences ??
      state.readErrors.links
  )
  const [bootstrapCreating, setBootstrapCreating] = useState(false)
  const detailTaskId = useLocalTaskPage((state) => state.detailTaskId)
  const model = useLocalTaskListModel()
  const cachedReadable = loaded && (hostState === 'ready' || hostState === 'read-only')
  const ready = cachedReadable && hasProjects && !bootstrapCreating
  const retryRead = (): void => {
    const errors = localTasksDomainStore.getState().readErrors
    if (errors.status) {
      void refreshHomeLibrary(null)
    } else if (errors.projects) {
      void refreshHomeLibrary(['projects'])
    } else if (errors.tasks) {
      void refreshHomeLibrary(['tasks'])
    } else if (errors.preferences) {
      void refreshHomeLibrary(['preferences'])
    } else if (errors.links) {
      void refreshHomeLibrary(['links'])
    }
  }
  useLocalTaskPageKeys(model, ready)

  let body: ReactNode
  if (connection === 'live' && readError && !cachedReadable) {
    body = <LocalTaskReadErrorPanel detail={readError} onRetry={retryRead} />
  } else if (!readable && !cachedReadable) {
    body = <LocalTaskHostStatePanel />
  } else if (!loaded) {
    body = (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
        {translate('localTasks.page.loading', 'Loading tasks…')}
      </div>
    )
  } else if (!hasProjects || bootstrapCreating) {
    body = (
      <LocalTaskBootstrap
        onStart={() => setBootstrapCreating(true)}
        onDone={() => setBootstrapCreating(false)}
      />
    )
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
      <LocalTaskLibraryNotices />
      {readError && cachedReadable ? (
        <LocalTaskReadErrorPanel detail={readError} onRetry={retryRead} compact />
      ) : null}
      {body}
      {ready ? <LocalTaskCreateDialog model={model} /> : null}
      {ready ? <LocalTaskQuickPicker model={model} /> : null}
      {ready ? <LocalTaskLinkDialogHost model={model} /> : null}
    </div>
  )
}

function LocalTaskOverview({ model }: { model: LocalTaskListModel }): React.JSX.Element {
  const previewOpen = useLocalTaskPage((state) => state.previewOpen)
  const cursorTaskId = useLocalTaskPage((state) => (state.previewOpen ? state.cursorTaskId : null))
  const hasSelection = useLocalTaskPage((state) => state.selectedTaskIds.length > 0)
  const needsYou = useLocalTaskPage((state) => state.view === 'needs-you')
  const previewTask =
    previewOpen && cursorTaskId ? model.index.tasksById.get(cursorTaskId) : undefined
  useLocalTaskEscapeLayer('panel', hasSelection, () =>
    localTaskPageStore.getState().clearSelection()
  )
  useLocalTaskEscapeLayer('panel', previewTask !== undefined, () =>
    localTaskPageStore.getState().setPreviewOpen(false)
  )
  return (
    <div className="@container/local-task-page relative flex min-h-0 flex-1 gap-4 pt-2">
      <LocalTaskNav model={model} />
      {needsYou ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          <LocalTaskScopeMenu model={model} className="self-start @3xl/local-task-page:hidden" />
          <LocalTaskNeedsYouView model={model} />
        </div>
      ) : (
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
      )}
      {previewTask ? <LocalTaskPreview task={previewTask} index={model.index} /> : null}
    </div>
  )
}
