import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useIssueDomainStore } from '@/issues/use-issue-domain-store'
import { CreateIssueDialog } from './create-issue-dialog'

export function SidebarRootModeBar(): React.JSX.Element {
  const mode = useIssueDomainStore((state) => state.sidebarRootMode)
  const setMode = useIssueDomainStore((state) => state.setSidebarRootMode)
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <>
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-worktree-sidebar-border px-2">
        {(['workspaces', 'issues'] as const).map((value) => (
          <Button
            key={value}
            type="button"
            variant="ghost"
            size="xs"
            data-current={mode === value ? 'true' : undefined}
            className={cn(
              'h-6 flex-1 text-[11px] font-medium text-muted-foreground',
              mode === value && 'bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground'
            )}
            onClick={() => setMode(value)}
          >
            {value === 'workspaces' ? 'Workspaces' : 'Issues'}
          </Button>
        ))}
        {mode === 'issues' ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Create Issue"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={6}>
              Create Issue
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <CreateIssueDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  )
}
