import { useState } from 'react'
import { Archive, ExternalLink, Move, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type {
  DeleteIssuePlan,
  IssueDetail as IssueDetailData,
  IssueRouteExecutionHostId,
  RoundRecordPreview
} from '../../../../shared/issues/types'
import { IssueRuntimeClient } from '@/issues/issue-runtime-client'
import { issueDomainStore } from '@/issues/issues-domain-store'
import { IssueChildren } from './IssueChildren'
import { IssueConversationList } from './IssueConversationList'
import { IssueTimeline } from './IssueTimeline'
import { CreateIssueDialog } from '../sidebar/issues/create-issue-dialog'
import { IssueConversationActions } from './IssueConversationActions'
import { IssueReparentDialog } from './IssueReparentDialog'
import { IssueEditDialog } from './IssueEditDialog'

export function IssueDetail({
  route,
  detail,
  rounds,
  onChanged,
  canCreateChild
}: {
  route: IssueRouteExecutionHostId
  detail: IssueDetailData
  rounds: RoundRecordPreview[]
  onChanged(): void
  canCreateChild: boolean
}): React.JSX.Element {
  const { issue } = detail
  const [createChildOpen, setCreateChildOpen] = useState(false)
  const [reparentOpen, setReparentOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const title = issue.source.kind === 'local' ? issue.localTitle : issue.source.titleSnapshot
  return (
    <div className="scrollbar-sleek h-full overflow-y-auto bg-background">
      <header className="sticky top-0 z-10 flex min-h-12 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{title}</h1>
          <p className="truncate text-xs text-muted-foreground">
            {detail.authority.profileLabel ?? detail.authority.authorityExecutionHostId}
            {issue.state === 'archived' ? ' · Archived' : ''}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Edit Issue"
          onClick={() => setEditOpen(true)}
        >
          <Pencil className="size-3" />
        </Button>
        <Button
          variant="outline"
          size="xs"
          disabled={!canCreateChild}
          title={canCreateChild ? undefined : 'Issue hierarchy is limited to three levels'}
          onClick={() => setCreateChildOpen(true)}
        >
          <Plus className="size-3" />
          Child
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Move Issue"
          onClick={() => setReparentOpen(true)}
        >
          <Move className="size-3" />
        </Button>
        {issue.state === 'active' ? (
          <Button
            variant="outline"
            size="xs"
            onClick={() => void archiveIssue(route, detail, onChanged)}
          >
            <Archive className="size-3" />
            Archive
          </Button>
        ) : (
          <Button
            variant="outline"
            size="xs"
            onClick={() => void reopenIssue(route, detail, onChanged)}
          >
            <RotateCcw className="size-3" />
            Reopen
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Delete Issue"
          onClick={() => void deleteIssue(route, detail, onChanged)}
        >
          <Trash2 className="size-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Close Issue detail"
          onClick={() => issueDomainStore.getState().setActiveIssueRoute(null)}
        >
          <X className="size-3" />
        </Button>
      </header>
      <main className="mx-auto w-full max-w-4xl space-y-6 p-5">
        {issue.note ? (
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{issue.note}</p>
        ) : null}
        {issue.source.kind === 'external' ? (
          <a
            href={issue.source.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            {issue.source.provider} {issue.source.identifier}
            <ExternalLink className="size-3" />
          </a>
        ) : null}
        <IssueConversationActions route={route} issueId={issue.id} onChanged={onChanged} />
        <IssueConversationList
          route={route}
          conversations={detail.directConversations}
          onChanged={onChanged}
        />
        <IssueChildren route={route} issues={detail.directChildren} />
        <IssueTimeline route={route} rounds={rounds} onChanged={onChanged} />
      </main>
      <CreateIssueDialog
        open={createChildOpen}
        onOpenChange={setCreateChildOpen}
        parentId={issue.id}
        lockedRoute={route}
        onCreated={onChanged}
      />
      <IssueReparentDialog
        route={route}
        issue={issue}
        open={reparentOpen}
        onOpenChange={setReparentOpen}
        onChanged={onChanged}
      />
      <IssueEditDialog
        route={route}
        issue={issue}
        open={editOpen}
        onOpenChange={setEditOpen}
        onChanged={onChanged}
      />
    </div>
  )
}

async function archiveIssue(
  route: IssueRouteExecutionHostId,
  detail: IssueDetailData,
  onChanged: () => void
): Promise<void> {
  await mutateLifecycle(route, 'issues.archive', detail, onChanged)
}

async function reopenIssue(
  route: IssueRouteExecutionHostId,
  detail: IssueDetailData,
  onChanged: () => void
): Promise<void> {
  await mutateLifecycle(route, 'issues.reopen', detail, onChanged)
}

async function mutateLifecycle(
  route: IssueRouteExecutionHostId,
  method: 'issues.archive' | 'issues.reopen',
  detail: IssueDetailData,
  onChanged: () => void
): Promise<void> {
  try {
    await IssueRuntimeClient.forRoute(route).mutate(method, {
      mutationId: crypto.randomUUID(),
      issueId: detail.issue.id,
      expectedRecordRevision: detail.issue.recordRevision
    })
    onChanged()
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  }
}

async function deleteIssue(
  route: IssueRouteExecutionHostId,
  detail: IssueDetailData,
  onChanged: () => void
): Promise<void> {
  try {
    const client = IssueRuntimeClient.forRoute(route)
    const preparation = await client.mutate<{
      plan: DeleteIssuePlan
    }>('issues.prepareDelete', { issueId: detail.issue.id })
    if (
      !window.confirm(
        `Delete this Orca Issue? ${preparation.plan.children.length} child Issues will be promoted and ${preparation.plan.conversations.length} Conversations will be unbound.`
      )
    ) {
      return
    }
    await client.mutate('issues.delete', {
      mutationId: crypto.randomUUID(),
      plan: preparation.plan
    })
    issueDomainStore.getState().setActiveIssueRoute(null)
    onChanged()
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  }
}
