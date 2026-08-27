import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useIssueDomainStore } from '@/issues/use-issue-domain-store'
import { CreateIssueDialog } from './create-issue-dialog'

// 规格照抄 SidebarGroupByToggle —— 侧栏分段控件在 Orca 里已经有既定写法,别再发明一套。
const SEGMENT_CLASS =
  'h-6 grow basis-0 px-1 text-[10px] data-[state=on]:bg-foreground/10 data-[state=on]:font-semibold data-[state=on]:text-foreground'

export function SidebarRootModeBar(): React.JSX.Element {
  const mode = useIssueDomainStore((state) => state.sidebarRootMode)
  const setMode = useIssueDomainStore((state) => state.setSidebarRootMode)
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <>
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-worktree-sidebar-border px-2">
        {/* 分段控件用 ToggleGroup,和 SidebarGroupByToggle 同一形态 */}
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(value) => {
            if (value === 'workspaces' || value === 'issues') {
              setMode(value)
            }
          }}
          variant="outline"
          size="sm"
          className="h-6 flex-1 justify-stretch"
        >
          <ToggleGroupItem value="workspaces" className={SEGMENT_CLASS}>
            Workspaces
          </ToggleGroupItem>
          <ToggleGroupItem value="issues" className={SEGMENT_CLASS}>
            Issues
          </ToggleGroupItem>
        </ToggleGroup>
        {mode === 'issues' ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="shrink-0"
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
