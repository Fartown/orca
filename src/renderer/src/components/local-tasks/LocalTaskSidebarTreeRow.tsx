import { ChevronDown, ChevronRight } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'

const ROW_PADDING = 4
/** Each level steps in 20px; a guide line runs down the parent's caret column. */
export const LOCAL_TASK_TREE_INDENT = 20

export type LocalTaskTreeNodeKind = 'view' | 'project' | 'task' | 'session'

type LocalTaskSidebarTreeRowProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> & {
  node: LocalTaskTreeNodeKind
  depth: number
  /** Undefined for a leaf; a leaf keeps the caret's room so icons line up. */
  expanded?: boolean
  onToggle?: () => void
  selected?: boolean
  disabled?: boolean
  onActivate: () => void
  /** Hover actions over the row's right end, kept out of the row's own click and keys. */
  trailing?: React.ReactNode
  children: React.ReactNode
  ref?: React.Ref<HTMLDivElement>
}

/**
 * One flat row of the task tree. Rows are siblings, not nested, so a row's text is only its own;
 * the level lives in aria-level. Arrow Right/Left open and close, Enter or Space opens the node.
 */
export function LocalTaskSidebarTreeRow({
  node,
  depth,
  expanded,
  onToggle,
  selected = false,
  disabled = false,
  onActivate,
  trailing,
  children,
  className,
  style,
  onClick,
  onKeyDown,
  ...rest
}: LocalTaskSidebarTreeRowProps): React.JSX.Element {
  const expandable = expanded !== undefined && onToggle !== undefined
  // Why: views and projects are single 28px lines; tasks and sessions may wrap a second line.
  const branch = node === 'view' || node === 'project'
  return (
    <div
      {...rest}
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={expandable ? expanded : undefined}
      aria-selected={selected}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      data-task-tree-row=""
      data-local-task-tree-node={node}
      data-current={selected ? 'true' : undefined}
      className={cn(
        'group/tree-row relative flex w-full min-w-0 items-start rounded-md pr-1 text-left outline-none',
        !branch && 'py-0.5',
        'focus-visible:ring-1 focus-visible:ring-sidebar-ring',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-sidebar-accent',
        selected && 'bg-sidebar-accent',
        className
      )}
      style={{ paddingLeft: ROW_PADDING + depth * LOCAL_TASK_TREE_INDENT, ...style }}
      onClick={(event) => {
        onClick?.(event)
        if (!disabled && !event.defaultPrevented) {
          onActivate()
        }
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        // Why: keys pressed on a hover action bubble here and must not also open the row.
        if (event.defaultPrevented || event.target !== event.currentTarget || disabled) {
          return
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onActivate()
        } else if (expandable && event.key === 'ArrowRight' && !expanded) {
          event.preventDefault()
          onToggle()
        } else if (expandable && event.key === 'ArrowLeft' && expanded) {
          event.preventDefault()
          onToggle()
        }
      }}
    >
      {depth > 0 ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-px bg-sidebar-border"
          style={{ left: depth * LOCAL_TASK_TREE_INDENT - 8 }}
        />
      ) : null}
      <span
        aria-hidden
        className={cn(
          'flex w-4 shrink-0 items-center justify-center self-start text-muted-foreground',
          branch ? 'h-7' : 'h-5'
        )}
        title={
          expandable
            ? expanded
              ? translate('localTasks.sidebar.collapse', 'Collapse')
              : translate('localTasks.sidebar.expand', 'Expand')
            : undefined
        }
        onClick={(event) => {
          if (expandable) {
            event.preventDefault()
            event.stopPropagation()
            onToggle()
          }
        }}
      >
        {expandable ? (
          expanded ? (
            <ChevronDown className="size-3" />
          ) : (
            <ChevronRight className="size-3" />
          )
        ) : null}
      </span>
      <div className="min-w-0 flex-1 pl-1">{children}</div>
      {trailing ? (
        // Why overlay: a hidden action that kept its width would push the row's status icon inward.
        <span
          className={cn(
            'absolute right-1 z-10 hidden items-center rounded-md bg-sidebar-accent',
            'group-hover/tree-row:flex group-focus-within/tree-row:flex has-[[data-state=open]]:flex',
            branch ? 'top-0 h-7' : 'top-0.5 h-5'
          )}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {trailing}
        </span>
      ) : null}
    </div>
  )
}
