import React from 'react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

// 侧栏里所有「一个数字」的表达都走这里。主机分组头的工作区计数、Issue 行的注意力计数
// 必须是同一个 pill,否则同一个侧栏里会出现裸数字和徽章两种状态语言。
export function SidebarCountBadge({
  count,
  label,
  tone = 'muted'
}: {
  count: number
  /** 无障碍名与 tooltip 文案,例如 "3 workspaces"。 */
  label: string
  /** foreground 用于需要用户注意的计数,muted 用于纯信息。 */
  tone?: 'muted' | 'foreground'
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex h-4 shrink-0 overflow-hidden rounded-full border border-worktree-sidebar-border bg-worktree-sidebar-accent text-[9px] font-medium leading-none',
        tone === 'foreground' ? 'text-foreground' : 'text-muted-foreground/90'
      )}
      aria-label={label}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex h-full min-w-4 items-center justify-center px-1.5">
            {count}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {label}
        </TooltipContent>
      </Tooltip>
    </span>
  )
}
