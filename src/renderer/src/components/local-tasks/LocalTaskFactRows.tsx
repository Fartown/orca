import { useState } from 'react'
import { Button } from '@/components/ui/button'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { LocalTaskProgressSection } from '@/local-tasks/local-task-progress-sections'
import type { LocalTaskWorkspaceDiff } from './use-local-task-workspace-diff'

/** Labels in one column, values aligned beside them: a writeback's fields, the acceptance facts. */
export function LocalTaskFactRows({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <dl className={cn('grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5', className)}>
      {children}
    </dl>
  )
}

export function LocalTaskFactRow({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <>
      <dt className="truncate text-xs leading-5 text-muted-foreground" title={label}>
        {label}
      </dt>
      <dd className="min-w-0 break-words text-sm leading-5 text-foreground">{children}</dd>
    </>
  )
}

/** A writeback's labelled lines as rows, or its text as written when it has none. */
export function LocalTaskProgressBody({
  body,
  sections,
  after
}: {
  body: string
  sections: readonly LocalTaskProgressSection[] | null
  /** Extra rows that align with the writeback's own. */
  after?: React.ReactNode
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const long = body.length > 320 || body.split('\n').length > 6
  const content = sections ? (
    <LocalTaskFactRows>
      {sections.map((section, at) => (
        <LocalTaskFactRow key={`${at}:${section.label}`} label={section.label}>
          <CommentMarkdown content={section.text} variant="compact" className="text-sm" />
        </LocalTaskFactRow>
      ))}
    </LocalTaskFactRows>
  ) : (
    <CommentMarkdown content={body} variant="compact" className="text-sm text-foreground" />
  )
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className={cn('min-w-0 overflow-hidden', long && !expanded && 'max-h-32')}>
        {content}
      </div>
      {long ? (
        <Button
          variant="ghost"
          size="xs"
          className="self-start"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded
            ? translate('localTasks.latestProgress.showLess', 'Show less')
            : translate('localTasks.latestProgress.showMore', 'Show more')}
        </Button>
      ) : null}
      {after ? <LocalTaskFactRows>{after}</LocalTaskFactRows> : null}
    </div>
  )
}

/** "4 files +86 −12"; the line counts only when the host measured them. */
export function LocalTaskDiffStat({ diff }: { diff: LocalTaskWorkspaceDiff }): React.JSX.Element {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap tabular-nums">
      {translate('localTasks.links.fileCount', '{{count}} files', { count: diff.files })}
      {diff.added ? (
        <span className="text-[color:var(--git-decoration-added)]">+{diff.added}</span>
      ) : null}
      {diff.removed ? (
        <span className="text-[color:var(--git-decoration-deleted)]">−{diff.removed}</span>
      ) : null}
    </span>
  )
}
