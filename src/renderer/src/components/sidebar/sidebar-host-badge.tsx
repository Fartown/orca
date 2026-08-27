import React from 'react'
import { Badge } from '@/components/ui/badge'

// 主机在侧栏里是行上的一个标签,不是一层结构。样式照 worktree-card-meta-row 的
// hostContextLabel —— Workspaces 侧混主机时用的就是这个,两边必须同形。
export function SidebarHostBadge({ label }: { label: string }): React.JSX.Element {
  return (
    <Badge
      variant="secondary"
      className="h-[16px] max-w-[7rem] shrink-0 rounded border border-border bg-accent px-1.5 text-[10px] font-medium leading-none text-muted-foreground dark:border-border/50 dark:bg-accent/80"
    >
      <span className="truncate">{label}</span>
    </Badge>
  )
}
