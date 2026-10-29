import React from 'react'
import { ChevronDown, CircleDashed, SquareArrowOutUpRight } from 'lucide-react'
import { useStore } from 'zustand'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { VIRTUALIZED_SCROLL_ANCHOR_RECORD_EVENT } from '@/hooks/useVirtualizedScrollAnchor'
import { ProjectHeaderActions } from '@/components/sidebar/ProjectHeaderActions'
import { renderWorktreeSectionHeaderRow } from '@/components/sidebar/worktree-list/rows/SectionHeader'
import {
  handleRepoHeaderActionPointerDown,
  handleRepoHeaderCollapseAffordancePointerDown,
  shouldIgnoreRepoHeaderToggle,
  stopRepoHeaderKeyboardToggle
} from '@/components/sidebar/worktree-list/rows/header-event-guards'
import { WORKTREE_SECTION_HEADER_PADDING_LEFT } from '@/components/sidebar/worktree-list/rows/indentation'
import { getWorktreeOptionId } from '@/components/sidebar/worktree-list/rows/option-dom'
import { getVirtualRowTransform } from '@/components/sidebar/worktree-list/viewport/virtual-rows'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { openLocalTaskPage } from '@/local-tasks/local-task-navigation'
import { localTaskSidebarCollapseStore } from '@/local-tasks/local-task-sidebar-grouping'
import {
  isLocalTaskSidebarHeader,
  type LocalTaskSidebarHeaderRow
} from '@/local-tasks/local-task-sidebar-groups'
import { LocalTaskStatusIcon } from './LocalTaskIcons'

type SectionHeaderRowArgs = Parameters<typeof renderWorktreeSectionHeaderRow>[0]

function toggleGroup(element: HTMLElement, key: string): void {
  // Why: collapsing changes total height; snapshot the scroll anchor first, as upstream headers do.
  element
    .closest('[data-worktree-sidebar]')
    ?.dispatchEvent(new Event(VIRTUALIZED_SCROLL_ANCHOR_RECORD_EVENT))
  localTaskSidebarCollapseStore.getState().toggle(key)
}

function LocalTaskSidebarGroupHeader({
  row,
  highlighted
}: {
  row: LocalTaskSidebarHeaderRow
  highlighted: boolean
}): React.JSX.Element {
  const task = useLocalTasksDomain((state) =>
    row.localTaskId
      ? (state.tasks.find((candidate) => candidate.id === row.localTaskId) ?? null)
      : null
  )
  const status = useLocalTasksDomain((state) =>
    task
      ? (state.projects
          .find((project) => project.id === task.projectId)
          ?.statuses.find((candidate) => candidate.id === task.statusId) ?? null)
      : null
  )
  const collapsed = useStore(localTaskSidebarCollapseStore, (state) => state.collapsed.has(row.key))
  const label = task
    ? `${task.ref} ${task.title}`
    : translate('localTasks.sidebar.noTaskGroup', 'No task')
  const openLabel = task
    ? translate('localTasks.sidebar.openTask', 'Open {{ref}}', { ref: task.ref })
    : ''
  return (
    <div
      id={getWorktreeOptionId(row.key)}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-expanded={!collapsed}
      className={cn(
        'group relative flex h-7 w-full cursor-pointer items-center gap-1.5 pr-2 text-left',
        highlighted && 'rounded-md bg-worktree-sidebar-accent ring-1 ring-worktree-sidebar-ring/50'
      )}
      style={{ paddingLeft: WORKTREE_SECTION_HEADER_PADDING_LEFT }}
      onClick={(event) => {
        if (!shouldIgnoreRepoHeaderToggle(event)) {
          toggleGroup(event.currentTarget, row.key)
        }
      }}
      onKeyDown={(event) => {
        if (!shouldIgnoreRepoHeaderToggle(event) && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          toggleGroup(event.currentTarget, row.key)
        }
      }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <div className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
          {status ? (
            <LocalTaskStatusIcon category={status.category} color={status.color} />
          ) : (
            <CircleDashed className="size-3" />
          )}
        </div>
        {task ? (
          <span className="shrink-0 font-mono text-xs text-muted-foreground">{task.ref}</span>
        ) : null}
        <span className="min-w-0 truncate text-[13px] font-semibold leading-4">
          {task ? task.title : label}
        </span>
      </div>
      <ProjectHeaderActions>
        {task ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                data-repo-header-action=""
                aria-label={openLabel}
                onKeyDown={stopRepoHeaderKeyboardToggle}
                onPointerDown={handleRepoHeaderActionPointerDown}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  openLocalTaskPage({ taskId: task.id })
                }}
              >
                <SquareArrowOutUpRight className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              {openLabel}
            </TooltipContent>
          </Tooltip>
        ) : null}
        {row.count > 0 ? (
          <div
            className="flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground"
            data-repo-header-collapse-affordance=""
            aria-hidden
            onPointerDown={handleRepoHeaderCollapseAffordancePointerDown}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              toggleGroup(event.currentTarget, row.key)
            }}
          >
            <ChevronDown
              className={cn('size-3.5 transition-transform', collapsed && '-rotate-90')}
            />
          </div>
        ) : null}
      </ProjectHeaderActions>
    </div>
  )
}

/**
 * Section headers go to upstream; a task group's header renders here, in the same sticky frame.
 */
export function renderSectionOrTaskHeaderRow(args: SectionHeaderRowArgs): React.JSX.Element {
  if (!isLocalTaskSidebarHeader(args.row)) {
    return renderWorktreeSectionHeaderRow(args)
  }
  const { row, vItem, isActiveStickyHeader } = args
  return (
    <div
      key={vItem.key}
      role="presentation"
      data-worktree-virtual-row
      data-worktree-virtual-row-key={String(vItem.key)}
      data-worktree-virtual-row-start={vItem.start}
      data-worktree-sticky-header=""
      data-worktree-sticky-header-active={isActiveStickyHeader ? '' : undefined}
      data-index={vItem.index}
      ref={args.measureVirtualRowElement}
      className={cn(
        'left-0 right-0',
        args.hasHeaderTopSpacing && !isActiveStickyHeader && 'pt-1',
        isActiveStickyHeader
          ? cn('sticky z-20 bg-worktree-sidebar', args.hasStickyHost ? 'top-[35px]' : '-top-px')
          : 'absolute top-0'
      )}
      style={isActiveStickyHeader ? undefined : { transform: getVirtualRowTransform(vItem.start) }}
    >
      <LocalTaskSidebarGroupHeader
        row={row}
        highlighted={args.ctx.highlightedRevealRowKey === row.key}
      />
    </div>
  )
}
