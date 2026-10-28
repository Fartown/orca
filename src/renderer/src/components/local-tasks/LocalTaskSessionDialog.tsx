import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import AgentCombobox from '@/components/agent/AgentCombobox'
import { getAgentCatalog } from '@/lib/agent-catalog'
import { useAgentDetectionTargetForWorktree } from '@/hooks/useAgentDetectionTarget'
import { useDetectedAgents } from '@/hooks/useDetectedAgents'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { selectExecutionHostDisplayLabel } from '@/lib/execution-host-display-label'
import { filterEnabledTuiAgents, pickTuiAgent } from '../../../../shared/tui-agent-selection'
import type { TuiAgent } from '../../../../shared/tui-agent'
import type { LocalTaskWorkspaceLink } from '../../../../shared/local-tasks/local-task-link-types'
import type { LocalTask } from '../../../../shared/local-tasks/local-task-types'
import {
  launchLocalTaskSession,
  localTaskPromptFor,
  type LocalTaskPromptDelivery
} from '@/local-tasks/local-task-session-launch'
import { localTaskWorktreeHostId } from '@/local-tasks/local-task-workspace-resolution'
import type { Worktree } from '../../../../shared/worktree/types'
import { useLocalTaskWorkspace } from './LocalTaskProgress'

function SessionForm({
  task,
  link,
  worktree,
  onDone
}: {
  task: LocalTask
  link: LocalTaskWorkspaceLink
  worktree: Worktree
  onDone: () => void
}): React.JSX.Element {
  const settings = useAppStore((state) => state.settings)
  const hostLabel = useAppStore((state) =>
    selectExecutionHostDisplayLabel(state, localTaskWorktreeHostId(state, worktree))
  )
  const target = useAgentDetectionTargetForWorktree(worktree.id)
  const { detectedIds } = useDetectedAgents(target)
  const agents = useMemo(() => {
    const catalog = getAgentCatalog()
    const enabled = new Set(
      filterEnabledTuiAgents(
        catalog.map((entry) => entry.id),
        settings?.disabledTuiAgents
      )
    )
    return catalog.filter(
      (entry) => enabled.has(entry.id) && (detectedIds === null || detectedIds.includes(entry.id))
    )
  }, [detectedIds, settings?.disabledTuiAgents])
  const preferred = pickTuiAgent(
    settings?.defaultTuiAgent,
    agents.map((entry) => entry.id),
    settings?.disabledTuiAgents
  )
  const [chosen, setChosen] = useState<TuiAgent | null>(null)
  const agent = chosen ?? preferred
  const [delivery, setDelivery] = useState<LocalTaskPromptDelivery>('auto-submit')
  const prompt = useMemo(() => localTaskPromptFor(task), [task])
  const submit = (): void => {
    if (!agent) {
      return
    }
    if (launchLocalTaskSession({ task, link, agent, promptDelivery: delivery })) {
      onDone()
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5 text-sm">
        <span className="text-xs text-muted-foreground">
          {translate('localTasks.links.agent', 'Agent')}
        </span>
        <AgentCombobox agents={agents} value={agent} onValueChange={setChosen} allowNarrowTrigger />
        <span className="text-xs text-muted-foreground">
          {translate('localTasks.links.location', 'Location')}
        </span>
        <span className="min-w-0 truncate text-xs text-foreground" title={worktree.displayName}>
          {worktree.displayName}
          <span className="text-muted-foreground"> · {hostLabel}</span>
        </span>
        <span className="text-xs text-muted-foreground">
          {translate('localTasks.links.delivery', 'Prompt')}
        </span>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={delivery}
          onValueChange={(value) => {
            if (value === 'auto-submit' || value === 'draft') {
              setDelivery(value)
            }
          }}
          className="w-fit"
        >
          <ToggleGroupItem value="auto-submit">
            {translate('localTasks.links.deliverySend', 'Send now')}
          </ToggleGroupItem>
          <ToggleGroupItem value="draft">
            {translate('localTasks.links.deliveryDraft', 'Put in the input box')}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border border-border/60 bg-muted/30 p-2 font-sans text-xs text-muted-foreground scrollbar-sleek">
        {prompt}
      </pre>
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onDone}>
          {translate('localTasks.common.cancel', 'Cancel')}
        </Button>
        <Button size="sm" disabled={!agent} onClick={submit}>
          {translate('localTasks.links.openSession', 'Open session')}
        </Button>
      </DialogFooter>
    </div>
  )
}

/** Open session (REQ-010): agent, the read-only workspace, and whether the prompt is sent. */
export function LocalTaskSessionDialog({
  task,
  link,
  onClose
}: {
  task: LocalTask
  link: LocalTaskWorkspaceLink
  onClose: () => void
}): React.JSX.Element {
  const located = useLocalTaskWorkspace(link)
  const worktree = located !== null && typeof located !== 'string' ? located : null
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-local-task-overlay="" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {translate('localTasks.links.openSessionTitle', 'Open session · {{ref}}', {
              ref: task.ref
            })}
          </DialogTitle>
          <DialogDescription>{task.title}</DialogDescription>
        </DialogHeader>
        {worktree ? (
          <SessionForm task={task} link={link} worktree={worktree} onDone={onClose} />
        ) : (
          <p className="text-xs text-muted-foreground">
            {translate(
              'localTasks.links.workspaceUnverifiable',
              'The workspace cannot be reached now.'
            )}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
