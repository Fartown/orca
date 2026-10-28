import { cn } from '@/lib/utils'
import { localTaskHostLabelFor } from '@/local-tasks/local-task-endpoint-labels'

/** The row's host beside its ref, shown only while more than one Orca's tasks are listed. */
export function LocalTaskHostTag({
  id,
  labels,
  className
}: {
  id: string
  labels: ReadonlyMap<string, string> | undefined
  className?: string
}): React.JSX.Element | null {
  const label = localTaskHostLabelFor(labels, id)
  return label ? (
    <span
      className={cn('min-w-0 shrink truncate text-2xs text-muted-foreground', className)}
      title={label}
    >
      {label}
    </span>
  ) : null
}
