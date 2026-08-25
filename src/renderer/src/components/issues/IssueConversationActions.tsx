import { useMemo, useState } from 'react'
import { Link, Plus } from 'lucide-react'
import { toast } from 'sonner'
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
import { IssueRuntimeClient } from '@/issues/issue-runtime-client'
import { useIssueDomainStore } from '@/issues/use-issue-domain-store'
import { getWorktreeExecutionHostId, toSshExecutionHostId } from '../../../../shared/execution-host'
import { folderWorkspaceKey } from '../../../../shared/workspace-scope'
import type { IssueRouteExecutionHostId } from '../../../../shared/issues/types'
import { prepareAndLaunchIssueConversation } from './issue-conversation-launch-action'

export function IssueConversationActions({
  route,
  issueId,
  onChanged
}: {
  route: IssueRouteExecutionHostId
  issueId: string
  onChanged(): void
}): React.JSX.Element {
  const repos = useAppStore((state) => state.repos)
  const worktreesByRepo = useAppStore((state) => state.worktreesByRepo)
  const folderWorkspaces = useAppStore((state) => state.folderWorkspaces)
  const partition = useIssueDomainStore((state) => state.partitionsByRouteExecutionHostId[route])
  const [launchOpen, setLaunchOpen] = useState(false)
  const [bindOpen, setBindOpen] = useState(false)
  const [workspaceId, setWorkspaceId] = useState('')
  const [agent, setAgent] = useState('codex')
  const [conversationId, setConversationId] = useState('')
  const [pending, setPending] = useState(false)
  const workspaces = useMemo(() => {
    const worktrees = Object.values(worktreesByRepo)
      .flat()
      .flatMap((worktree) => {
        const repo = repos.find((candidate) => candidate.id === worktree.repoId)
        return getWorktreeExecutionHostId(worktree, repo, 'local') === route
          ? [
              {
                id: worktree.id,
                label: worktree.displayName,
                path: worktree.path,
                ref: { type: 'worktree' as const, worktreeId: worktree.id }
              }
            ]
          : []
      })
    const folders = folderWorkspaces.flatMap((workspace) => {
      const host =
        workspace.executionHostId ??
        (workspace.connectionId ? toSshExecutionHostId(workspace.connectionId) : 'local')
      return host === route
        ? [
            {
              id: folderWorkspaceKey(workspace.id),
              label: workspace.name,
              path: workspace.folderPath,
              ref: { type: 'folder' as const, folderWorkspaceId: workspace.id }
            }
          ]
        : []
    })
    return [...worktrees, ...folders]
  }, [folderWorkspaces, repos, route, worktreesByRepo])
  const unassigned = Object.values(partition?.conversationsById ?? {}).filter(
    (conversation) => conversation.issueId === null
  )

  const launch = async (): Promise<void> => {
    const workspace = workspaces.find((candidate) => candidate.id === workspaceId)
    if (!workspace) {
      return
    }
    setPending(true)
    const launchToken = crypto.randomUUID()
    try {
      const outcome = await prepareAndLaunchIssueConversation({
        route,
        issueId,
        workspace,
        agent: agent as Parameters<typeof prepareAndLaunchIssueConversation>[0]['agent'],
        mutationId: crypto.randomUUID(),
        launchToken
      })
      setLaunchOpen(false)
      onChanged()
      if (outcome.status === 'launcher-failed') {
        toast.error(outcome.message)
      }
    } catch (error) {
      onChanged()
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  const bind = async (): Promise<void> => {
    const conversation = unassigned.find((candidate) => candidate.id === conversationId)
    if (!conversation) {
      return
    }
    setPending(true)
    try {
      await IssueRuntimeClient.forRoute(route).mutate('conversations.bindIssue', {
        mutationId: crypto.randomUUID(),
        conversationId: conversation.id,
        issueId,
        expectedRecordRevision: conversation.recordRevision
      })
      setBindOpen(false)
      onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="default" size="sm" onClick={() => setLaunchOpen(true)}>
          <Plus className="size-3.5" />
          New Conversation
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={unassigned.length === 0}
          onClick={() => setBindOpen(true)}
        >
          <Link className="size-3.5" />
          Bind existing
        </Button>
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
          <Select value={agent} onValueChange={setAgent}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['codex', 'claude', 'gemini', 'opencode'].map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLaunchOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!workspaceId || pending} onClick={() => void launch()}>
              {pending ? 'Starting…' : 'Start'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={bindOpen} onOpenChange={setBindOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bind Conversation</DialogTitle>
            <DialogDescription>Move an unassigned Conversation into this Issue.</DialogDescription>
          </DialogHeader>
          <Select value={conversationId} onValueChange={setConversationId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Conversation" />
            </SelectTrigger>
            <SelectContent>
              {unassigned.map((conversation) => (
                <SelectItem key={conversation.id} value={conversation.id}>
                  {conversation.title ?? conversation.agent} · {conversation.workspaceSnapshot.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBindOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!conversationId || pending} onClick={() => void bind()}>
              Bind
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
