import { Target } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { goalDomainStore } from '@/goals/goals-domain-store'
import { useGoalDomainStore } from '@/goals/use-goals-domain-store'

/**
 * Pane-header entry: "Set goal" on an agent pane without one, "View goal" when a
 * live goal is bound to it. Captures the exact pane so later focus changes do
 * not move the target. Plain shells render nothing.
 */
export function GoalSessionAction({
  worktreeId,
  tabId,
  leafId
}: {
  worktreeId: string
  tabId: string
  leafId: string
}): React.JSX.Element | null {
  const paneKey = `${tabId}:${leafId}`
  const agentEntry = useAppStore((s) => s.agentStatusByPaneKey[paneKey])
  const terminalHandle = agentEntry?.terminalHandle ?? null
  const boundGoalId = useGoalDomainStore(
    (s) =>
      (terminalHandle &&
        s.summaries.find(
          (summary) =>
            summary.binding.terminal === terminalHandle &&
            !summary.archived &&
            summary.phase !== 'complete'
        )?.goalId) ||
      null
  )
  if (!agentEntry) {
    return null
  }
  const label = boundGoalId
    ? translate('goals.sessionAction.view', 'View goal')
    : translate('goals.sessionAction.set', 'Set goal')
  const activate = (): void => {
    const app = useAppStore.getState()
    app.setRightSidebarOpen(true)
    app.setRightSidebarTab('goals')
    if (boundGoalId) {
      goalDomainStore.getState().select(boundGoalId)
    } else {
      goalDomainStore.getState().openEditor({ worktreeId, paneKey })
    }
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="pane-title-split-trigger"
          aria-label={label}
          data-goal-bound={boundGoalId ? '' : undefined}
          onClick={(event) => {
            event.stopPropagation()
            activate()
          }}
        >
          <Target className="size-3" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
