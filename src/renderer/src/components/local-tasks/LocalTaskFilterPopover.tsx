import { useMemo } from 'react'
import { ListFilter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'
import { translate } from '@/i18n/i18n'
import {
  LOCAL_TASK_PRIORITIES,
  LOCAL_TASK_STATUS_CATEGORIES
} from '../../../../shared/local-tasks/local-task-model'
import { collectLocalTaskLabels } from '@/local-tasks/local-task-grouping'
import {
  EMPTY_LOCAL_TASK_FILTERS,
  localTaskPageStore,
  useLocalTaskPage,
  type LocalTaskFilters
} from '@/local-tasks/local-task-page-store'
import {
  localTaskCategoryLabel,
  localTaskPriorityLabel
} from '@/local-tasks/local-task-vocabulary-copy'
import { LocalTaskPriorityIcon, LocalTaskStatusIcon } from './LocalTaskIcons'
import type { LocalTaskListModel } from './use-local-task-list-model'

function toggle<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}

function FilterOption({
  checked,
  onToggle,
  children
}: {
  checked: boolean
  onToggle: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <label className="flex h-7 cursor-pointer items-center gap-2 rounded-md px-2 text-xs hover:bg-accent">
      <Checkbox checked={checked} onCheckedChange={onToggle} />
      {children}
    </label>
  )
}

function Section({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="px-2 pb-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </span>
      {children}
    </div>
  )
}

export function LocalTaskFilterPopover({
  model
}: {
  model: LocalTaskListModel
}): React.JSX.Element {
  const open = useLocalTaskPage((state) => state.filterOpen)
  const filters = useLocalTaskPage((state) => state.filters)
  const layout = useLocalTaskPage((state) => state.layout)
  const showCanceled = useLocalTaskPage((state) => state.showCanceledColumn)
  const labels = useMemo(() => collectLocalTaskLabels(model.scopeTasks), [model.scopeTasks])
  const activeCount =
    filters.priorities.length +
    filters.labels.length +
    filters.categories.length +
    (filters.needsYou ? 1 : 0)
  const update = (next: Partial<LocalTaskFilters>): void =>
    localTaskPageStore.getState().setFilters({ ...filters, ...next })
  return (
    <Popover open={open} onOpenChange={(next) => localTaskPageStore.getState().setFilterOpen(next)}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <ListFilter className="size-3.5" />
          {activeCount > 0
            ? translate('localTasks.filter.activeCount', 'Filter · {{count}}', {
                count: activeCount
              })
            : translate('localTasks.filter.trigger', 'Filter')}
          <ShortcutKeyCombo
            keys={['F']}
            className="ml-1"
            keyCapClassName="min-w-5 px-1 py-0 text-2xs"
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <div className="flex flex-col gap-3 p-2">
          <FilterOption
            checked={filters.needsYou}
            onToggle={() => update({ needsYou: !filters.needsYou })}
          >
            {translate('localTasks.needsYou.filter', 'A session is waiting on me')}
          </FilterOption>
          <Section title={translate('localTasks.filter.priority', 'Priority')}>
            {LOCAL_TASK_PRIORITIES.map((priority) => (
              <FilterOption
                key={priority}
                checked={filters.priorities.includes(priority)}
                onToggle={() => update({ priorities: toggle(filters.priorities, priority) })}
              >
                <LocalTaskPriorityIcon priority={priority} />
                {localTaskPriorityLabel(priority)}
              </FilterOption>
            ))}
          </Section>
          <Section title={translate('localTasks.filter.category', 'Status category')}>
            {LOCAL_TASK_STATUS_CATEGORIES.map((category) => (
              <FilterOption
                key={category}
                checked={filters.categories.includes(category)}
                onToggle={() => update({ categories: toggle(filters.categories, category) })}
              >
                <LocalTaskStatusIcon category={category} color="gray" />
                {localTaskCategoryLabel(category)}
              </FilterOption>
            ))}
          </Section>
          <Section title={translate('localTasks.filter.labels', 'Labels')}>
            {labels.length === 0 ? (
              <span className="px-2 text-xs text-muted-foreground">
                {translate('localTasks.filter.noLabels', 'No labels yet')}
              </span>
            ) : (
              <div className="flex max-h-40 flex-col gap-0.5 overflow-y-auto scrollbar-sleek">
                {labels.map((label) => (
                  <FilterOption
                    key={label}
                    checked={filters.labels.includes(label)}
                    onToggle={() => update({ labels: toggle(filters.labels, label) })}
                  >
                    <span className="truncate">{label}</span>
                  </FilterOption>
                ))}
              </div>
            )}
          </Section>
          {layout === 'board' ? (
            <FilterOption
              checked={showCanceled}
              onToggle={() => localTaskPageStore.getState().setShowCanceledColumn(!showCanceled)}
            >
              {translate('localTasks.filter.showCanceledColumn', 'Show the Canceled column')}
            </FilterOption>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            disabled={activeCount === 0}
            onClick={() => localTaskPageStore.getState().setFilters(EMPTY_LOCAL_TASK_FILTERS)}
          >
            {translate('localTasks.filter.clear', 'Clear filters')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
