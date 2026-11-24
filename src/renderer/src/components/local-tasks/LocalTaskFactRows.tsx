import { useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import CommentMarkdown from '@/components/comment-markdown/CommentMarkdown'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'
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
  const [disclosure, setDisclosure] = useState({ body, expanded: false })
  const expanded = disclosure.body === body && disclosure.expanded
  const [measurement, setMeasurement] = useState({ body, overflow: false })
  const overflow = measurement.body === body && measurement.overflow
  const clipRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (disclosure.body !== body) {
      setDisclosure({ body, expanded: false })
    }
  }, [body, disclosure.body])
  useLayoutEffect(() => {
    const clip = clipRef.current
    if (!clip) {
      return
    }
    const measure = (): void => {
      if (!expanded) {
        const next = clip.scrollHeight > clip.clientHeight + 1
        setMeasurement((current) =>
          current.body === body && current.overflow === next ? current : { body, overflow: next }
        )
      }
    }
    measure()
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure)
      observer.observe(clip)
      return () => observer.disconnect()
    }
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [body, expanded])
  const content = sections ? (
    <LocalTaskFactRows>
      {sections.map((section, at) => (
        <LocalTaskFactRow key={`${at}:${section.label}`} label={section.label}>
          <CommentMarkdown
            content={section.text}
            variant="compact"
            className="text-sm leading-5 [&_li]:leading-5"
          />
        </LocalTaskFactRow>
      ))}
    </LocalTaskFactRows>
  ) : (
    <CommentMarkdown
      content={body}
      variant="compact"
      className="text-sm leading-5 text-foreground [&_li]:leading-5"
    />
  )
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div
        ref={clipRef}
        className={cn(
          'min-w-0 overflow-hidden',
          !expanded &&
            'max-h-[3.75rem] [&_.comment-md-h]:block [&_.comment-md-p]:block [&_blockquote]:my-0 [&_code]:leading-none [&_code]:py-0 [&_dl]:gap-y-0 [&_hr]:my-0 [&_ol]:my-0 [&_pre]:my-0 [&_pre]:py-0 [&_pre_code]:leading-5 [&_ul]:my-0'
        )}
      >
        {content}
      </div>
      {overflow ? (
        <Button
          variant="ghost"
          size="xs"
          className="self-start"
          aria-expanded={expanded}
          onClick={() => setDisclosure({ body, expanded: !expanded })}
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
