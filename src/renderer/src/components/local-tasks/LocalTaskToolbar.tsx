import { useEffect, useRef } from 'react'
import { Kanban, List, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'
import { translate } from '@/i18n/i18n'
import { localTaskPageStore, useLocalTaskPage } from '@/local-tasks/local-task-page-store'
import { localTaskViewLabel } from '@/local-tasks/local-task-vocabulary-copy'
import { isLocalTasksWritable, useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { LocalTaskFilterPopover } from './LocalTaskFilterPopover'
import { LocalTaskViewOptions } from './LocalTaskViewOptions'
import type { LocalTaskListModel } from './use-local-task-list-model'

function SearchField(): React.JSX.Element {
  const query = useLocalTaskPage((state) => state.query)
  const focusRequest = useLocalTaskPage((state) => state.searchFocusRequest)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (focusRequest > 0) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [focusRequest])
  return (
    <Input
      ref={inputRef}
      value={query}
      onChange={(event) => localTaskPageStore.getState().setQuery(event.target.value)}
      placeholder={translate('localTasks.toolbar.searchPlaceholder', 'Search by ref or title')}
      aria-label={translate('localTasks.toolbar.search', 'Search tasks')}
      className="h-8 w-56"
    />
  )
}

export function LocalTaskToolbar({ model }: { model: LocalTaskListModel }): React.JSX.Element {
  const view = useLocalTaskPage((state) => state.view)
  const layout = useLocalTaskPage((state) => state.layout)
  const writable = useLocalTasksDomain(isLocalTasksWritable)
  const scopeLabel =
    model.scopeProject?.name ?? translate('localTasks.nav.allProjects', 'All projects')
  return (
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="mr-1 min-w-0 truncate text-sm font-medium text-foreground">
        {scopeLabel}
        <span className="ml-1.5 font-normal text-muted-foreground">
          · {localTaskViewLabel(view)}
        </span>
      </h2>
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
      >
        <ToggleGroupItem value="list">
          <List className="size-3.5" />
          {translate('localTasks.toolbar.list', 'List')}
        </ToggleGroupItem>
        <ToggleGroupItem value="board">
          <Kanban className="size-3.5" />
          {translate('localTasks.toolbar.board', 'Board')}
        </ToggleGroupItem>
      </ToggleGroup>
      <LocalTaskViewOptions />
      <div className="ml-auto flex items-center gap-2">
        <LocalTaskFilterPopover model={model} />
        <SearchField />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              disabled={!writable}
              onClick={() =>
                localTaskPageStore.getState().openCreate({ projectId: model.scopeProjectId })
              }
            >
              <Plus className="size-3.5" />
              {translate('localTasks.toolbar.newTask', 'New task')}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={4}>
            <span className="flex items-center gap-2">
              {translate('localTasks.toolbar.newTask', 'New task')}
              <ShortcutKeyCombo keys={['C']} />
            </span>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
