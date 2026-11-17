import { useEffect, useRef } from 'react'
import { Kanban, List, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { translate } from '@/i18n/i18n'
import { localTaskPageStore, useLocalTaskPage } from '@/local-tasks/local-task-page-store'
import { useCanCreateLocalTask } from '@/local-tasks/local-task-write-access'
import { useLocalTaskCreateWriteReason } from '@/local-tasks/local-task-write-reason'
import { LocalTaskActionTooltip } from './LocalTaskActionTooltip'
import { LocalTaskFilterPopover } from './LocalTaskFilterPopover'
import { LocalTaskScopeMenu, LocalTaskScopeTitle } from './LocalTaskNav'
import { LocalTaskViewOptions } from './LocalTaskViewOptions'
import type { LocalTaskListModel } from './use-local-task-list-model'

function SearchField(): React.JSX.Element {
  const query = useLocalTaskPage((state) => state.query)
  const focusRequest = useLocalTaskPage((state) => state.searchFocusRequest)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (focusRequest > localTaskPageStore.getState().consumedSearchFocusRequest) {
      inputRef.current?.focus()
      inputRef.current?.select()
      localTaskPageStore.getState().consumeSearchFocus(focusRequest)
    }
  }, [focusRequest])
  return (
    <div className="relative min-w-0 flex-1 @3xl/local-task-toolbar:w-40 @3xl/local-task-toolbar:flex-none @5xl/local-task-toolbar:w-56">
      <Input
        adornment="trailing"
        ref={inputRef}
        value={query}
        onChange={(event) => localTaskPageStore.getState().setQuery(event.target.value)}
        placeholder={translate('localTasks.toolbar.searchPlaceholder', 'Search title or ref')}
        aria-label={translate('localTasks.toolbar.search', 'Search tasks')}
        className="h-8 w-full"
      />
      {query ? (
        <Button
          variant="ghost"
          size="icon-xs"
          className="absolute right-1 top-1"
          aria-label={translate('localTasks.toolbar.clearSearch', 'Clear search')}
          onClick={() => {
            localTaskPageStore.getState().setQuery('')
            inputRef.current?.focus()
          }}
        >
          <X className="size-3.5" />
        </Button>
      ) : null}
    </div>
  )
}

export function LocalTaskToolbar({ model }: { model: LocalTaskListModel }): React.JSX.Element {
  const layout = useLocalTaskPage((state) => state.layout)
  const navExpanded = useLocalTaskPage((state) => state.navExpanded)
  const writable = useCanCreateLocalTask(model.scopeProjectId)
  const writeReason = useLocalTaskCreateWriteReason(model.scopeProjectId)
  const newTask = translate('localTasks.toolbar.newTask', 'New task')
  return (
    <div className="@container/local-task-toolbar">
      <div className="flex min-w-0 flex-col gap-2 @3xl/local-task-toolbar:flex-row @3xl/local-task-toolbar:items-center">
        <div className="flex min-w-0 items-center gap-2 @3xl/local-task-toolbar:flex-1">
          {navExpanded ? (
            <LocalTaskScopeTitle model={model} className="hidden @3xl/local-task-page:flex" />
          ) : null}
          <LocalTaskScopeMenu
            model={model}
            className={navExpanded ? '@3xl/local-task-page:hidden' : undefined}
          />
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={layout}
            onValueChange={(value) => {
              if (value === 'list' || value === 'board') {
                localTaskPageStore.getState().setLayout(value)
              }
            }}
            aria-label={translate('localTasks.toolbar.layout', 'Layout')}
            className="shrink-0"
          >
            <ToggleGroupItem value="list" aria-label={translate('localTasks.toolbar.list', 'List')}>
              <List className="size-3.5" />
              <span className="hidden @3xl/local-task-toolbar:inline">
                {translate('localTasks.toolbar.list', 'List')}
              </span>
            </ToggleGroupItem>
            <ToggleGroupItem
              value="board"
              aria-label={translate('localTasks.toolbar.board', 'Board')}
            >
              <Kanban className="size-3.5" />
              <span className="hidden @3xl/local-task-toolbar:inline">
                {translate('localTasks.toolbar.board', 'Board')}
              </span>
            </ToggleGroupItem>
          </ToggleGroup>
          <LocalTaskViewOptions />
        </div>
        <div className="flex min-w-0 w-full items-center gap-2 @3xl/local-task-toolbar:w-auto @3xl/local-task-toolbar:shrink-0">
          <LocalTaskFilterPopover model={model} />
          <SearchField />
          <LocalTaskActionTooltip reason={writeReason} label={newTask} shortcut={['C']}>
            <Button
              size="sm"
              className="shrink-0"
              disabled={!writable}
              aria-label={newTask}
              onClick={() =>
                localTaskPageStore.getState().openCreate({ projectId: model.scopeProjectId })
              }
            >
              <Plus className="size-3.5" />
              <span>{newTask}</span>
            </Button>
          </LocalTaskActionTooltip>
        </div>
      </div>
    </div>
  )
}
