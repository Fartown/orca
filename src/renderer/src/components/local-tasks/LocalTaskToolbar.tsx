import { useEffect, useRef } from 'react'
import { Kanban, List, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'
import { translate } from '@/i18n/i18n'
import { localTaskPageStore, useLocalTaskPage } from '@/local-tasks/local-task-page-store'
import { useCanCreateLocalTask } from '@/local-tasks/local-task-write-access'
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
    <Input
      ref={inputRef}
      value={query}
      onChange={(event) => localTaskPageStore.getState().setQuery(event.target.value)}
      placeholder={translate('localTasks.toolbar.searchPlaceholder', 'Search title or ref')}
      aria-label={translate('localTasks.toolbar.search', 'Search tasks')}
      className="h-8 w-40 @5xl/local-task-toolbar:w-56"
    />
  )
}

/**
 * One row at every width: as the column narrows, labels fold into icons before anything wraps,
 * and the title becomes the view menu once the page hides its rail.
 */
export function LocalTaskToolbar({ model }: { model: LocalTaskListModel }): React.JSX.Element {
  const layout = useLocalTaskPage((state) => state.layout)
  const writable = useCanCreateLocalTask(model.scopeProjectId)
  const newTask = translate('localTasks.toolbar.newTask', 'New task')
  return (
    <div className="@container/local-task-toolbar">
      <div className="flex min-w-0 items-center gap-2">
        <LocalTaskScopeTitle model={model} className="hidden @3xl/local-task-page:flex" />
        <LocalTaskScopeMenu model={model} className="@3xl/local-task-page:hidden" />
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
        <span className="min-w-0 flex-1" />
        <LocalTaskFilterPopover model={model} />
        <SearchField />
        <Tooltip>
          <TooltipTrigger asChild>
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
              <span className="hidden @2xl/local-task-toolbar:inline">{newTask}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={4}>
            <span className="flex items-center gap-2">
              {newTask}
              <ShortcutKeyCombo keys={['C']} />
            </span>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
