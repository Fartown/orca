import { useEffect, useMemo, useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import AgentCombobox from '@/components/agent/AgentCombobox'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useAppStore } from '@/store'
import { useAgentDetectionTargetForWorktree } from '@/hooks/useAgentDetectionTarget'
import { useDetectedAgents } from '@/hooks/useDetectedAgents'
import { getAgentCatalog } from '@/lib/agent-catalog'
import type { IssueRouteExecutionHostId } from '../../../../shared/issues/types'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { filterEnabledTuiAgents, pickTuiAgent } from '../../../../shared/tui-agent-selection'
import { prepareAndLaunchIssueConversation } from './issue-conversation-launch-action'
import { IssueConversationBindingPopover } from './IssueConversationBindingPopover'
import { collectIssueConversationLaunchWorkspaces } from './issue-conversation-launch-workspaces'

export function IssueConversationActions({
  route,
  issueId,
  onChanged
}: {
  route: IssueRouteExecutionHostId
  issueId: string
  onChanged: () => void
}): React.JSX.Element {
  const repos = useAppStore((state) => state.repos)
  const worktreesByRepo = useAppStore((state) => state.worktreesByRepo)
  const folderWorkspaces = useAppStore((state) => state.folderWorkspaces)
  const projectGroups = useAppStore((state) => state.projectGroups)
  const settings = useAppStore((state) => state.settings)
  const [launchOpen, setLaunchOpen] = useState(false)
  const [workspaceId, setWorkspaceId] = useState('')
  const [agent, setAgent] = useState<TuiAgent | null>(null)
  const [pending, setPending] = useState(false)
  const workspaces = useMemo(() => {
    return collectIssueConversationLaunchWorkspaces({
      repos,
      worktreesByRepo,
      folderWorkspaces,
      projectGroups,
      route
    })
  }, [folderWorkspaces, projectGroups, repos, route, worktreesByRepo])
  const selectedWorkspace = useMemo(
    () => workspaces.find((candidate) => candidate.id === workspaceId) ?? null,
    [workspaces, workspaceId]
  )
  const detectionTarget = useAgentDetectionTargetForWorktree(selectedWorkspace?.id ?? null)
  const {
    detectedIds,
    isLoading: detectingAgents,
    detectionFailed
  } = useDetectedAgents(launchOpen && selectedWorkspace ? detectionTarget : undefined)
  const enabledDetectedAgents = useMemo(
    () => filterEnabledTuiAgents(detectedIds ?? [], settings?.disabledTuiAgents),
    [detectedIds, settings?.disabledTuiAgents]
  )
  const agentOptions = useMemo(() => {
    const enabled = new Set(enabledDetectedAgents)
    return getAgentCatalog().filter((entry) => enabled.has(entry.id))
  }, [enabledDetectedAgents])

  useEffect(() => {
    setAgent(null)
  }, [workspaceId])

  useEffect(() => {
    if (!launchOpen || detectedIds === null) {
      return
    }
    setAgent((current) =>
      current && enabledDetectedAgents.includes(current)
        ? current
        : pickTuiAgent(
            settings?.defaultTuiAgent,
            enabledDetectedAgents,
            settings?.disabledTuiAgents
          )
    )
  }, [
    detectedIds,
    enabledDetectedAgents,
    launchOpen,
    settings?.defaultTuiAgent,
    settings?.disabledTuiAgents
  ])

  const launch = async (): Promise<void> => {
    if (!selectedWorkspace || !agent) {
      return
    }
    setPending(true)
    const launchToken = crypto.randomUUID()
    try {
      await prepareAndLaunchIssueConversation({
        route,
        issueId,
        workspace: selectedWorkspace,
        agent,
        mutationId: crypto.randomUUID(),
        launchToken
      })
      setLaunchOpen(false)
      onChanged()
    } catch (error) {
      onChanged()
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          variant="default"
          size="sm"
          onClick={() => {
            if (!selectedWorkspace) {
              setWorkspaceId(workspaces[0]?.id ?? '')
            }
            setLaunchOpen(true)
          }}
        >
          <Plus className="size-3.5" />
          New Conversation
        </Button>
        <IssueConversationBindingPopover route={route} issueId={issueId} onChanged={onChanged} />
      </div>
      <Dialog open={launchOpen} onOpenChange={setLaunchOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Conversation</DialogTitle>
            <DialogDescription>Select a Workspace on this Issue authority.</DialogDescription>
          </DialogHeader>
          <Select value={workspaceId} onValueChange={setWorkspaceId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Workspace" />
            </SelectTrigger>
            <SelectContent>
              {workspaces.map((workspace) => (
                <SelectItem key={workspace.id} value={workspace.id}>
                  {workspace.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <AgentCombobox
            agents={agentOptions}
            value={agent}
            onValueChange={setAgent}
            allowBlankTerminal={false}
            triggerClassName="w-full"
          />
          {detectingAgents ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Detecting agents…
            </div>
          ) : detectionFailed ? (
            <p className="text-xs text-muted-foreground">
              Agent detection failed on this Workspace host.
            </p>
          ) : detectedIds && agentOptions.length === 0 ? (
            <p className="text-xs text-muted-foreground">No enabled agents were detected.</p>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLaunchOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                !selectedWorkspace || !agent || detectedIds === null || detectingAgents || pending
              }
              onClick={() => void launch()}
            >
              {pending ? 'Starting…' : 'Start'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
