import { cn } from '@/lib/utils'
import type {
  LocalTaskPriority,
  LocalTaskStatusCategory,
  LocalTaskStatusColor
} from '../../../../shared/local-tasks/local-task-model'

/** Stored status colours are names; each maps to an existing theme token so light and dark follow. */
export function localTaskStatusColorVar(color: LocalTaskStatusColor): string {
  switch (color) {
    case 'gray':
      return 'var(--muted-foreground)'
    case 'blue':
      return 'var(--callout-note)'
    case 'yellow':
      return 'var(--workspace-status-progress)'
    case 'orange':
      return 'var(--agent-question)'
    case 'green':
      return 'var(--status-success)'
    case 'red':
      return 'var(--destructive)'
    case 'purple':
      return 'var(--callout-important)'
  }
}

function Ring({ color, dashed }: { color: string; dashed?: boolean }): React.JSX.Element {
  return (
    <circle
      cx="7"
      cy="7"
      r="5.75"
      fill="none"
      stroke={color}
      strokeWidth="1.5"
      strokeDasharray={dashed ? '2.1 2.42' : undefined}
    />
  )
}

/** The category decides the glyph, the status colour fills it (design v4). */
export function LocalTaskStatusIcon({
  category,
  color,
  className
}: {
  category: LocalTaskStatusCategory
  color: LocalTaskStatusColor
  className?: string
}): React.JSX.Element {
  const fill = localTaskStatusColorVar(color)
  return (
    <svg viewBox="0 0 14 14" aria-hidden="true" className={cn('size-3.5 shrink-0', className)}>
      {category === 'backlog' ? <Ring color={fill} dashed /> : null}
      {category === 'unstarted' ? <Ring color={fill} /> : null}
      {category === 'started' ? (
        <>
          <Ring color={fill} />
          <path d="M7 3.5A3.5 3.5 0 0 1 7 10.5Z" fill={fill} />
        </>
      ) : null}
      {category === 'review' ? (
        <>
          <Ring color={fill} />
          <path d="M7 3.5A3.5 3.5 0 1 1 3.5 7H7Z" fill={fill} />
        </>
      ) : null}
      {category === 'completed' ? (
        <>
          <circle cx="7" cy="7" r="6.5" fill={fill} />
          <path
            d="M4.4 7.2l1.8 1.8 3.5-3.6"
            fill="none"
            stroke="var(--background)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : null}
      {category === 'canceled' ? (
        <>
          <circle cx="7" cy="7" r="6.5" fill={fill} />
          <path
            d="M5 5l4 4M9 5l-4 4"
            stroke="var(--background)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </>
      ) : null}
    </svg>
  )
}

const BAR_COUNT: Record<LocalTaskPriority, number> = { 0: 0, 1: 3, 2: 3, 3: 2, 4: 1 }

export function LocalTaskPriorityIcon({
  priority,
  className
}: {
  priority: LocalTaskPriority
  className?: string
}): React.JSX.Element {
  const box = cn('size-3.5 shrink-0', className)
  if (priority === 1) {
    return (
      <svg viewBox="0 0 14 14" aria-hidden="true" className={box}>
        <rect x="1" y="1" width="12" height="12" rx="3" fill="var(--agent-question)" />
        <rect x="6.2" y="3.3" width="1.6" height="4.9" rx=".8" fill="var(--background)" />
        <circle cx="7" cy="10.2" r=".95" fill="var(--background)" />
      </svg>
    )
  }
  if (priority === 0) {
    return (
      <svg viewBox="0 0 14 14" aria-hidden="true" className={box}>
        {[1.75, 5.75, 9.75].map((x) => (
          <rect
            key={x}
            x={x}
            y="6.25"
            width="2.5"
            height="1.5"
            rx=".6"
            fill="var(--muted-foreground)"
            opacity=".45"
          />
        ))}
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 14 14" aria-hidden="true" className={box}>
      {[0, 1, 2].map((bar) => (
        <rect
          key={bar}
          x={1.5 + bar * 4}
          y={12 - (4 + bar * 3)}
          width="3"
          height={4 + bar * 3}
          rx="1"
          fill="var(--muted-foreground)"
          opacity={bar < BAR_COUNT[priority] ? 1 : 0.3}
        />
      ))}
    </svg>
  )
}
