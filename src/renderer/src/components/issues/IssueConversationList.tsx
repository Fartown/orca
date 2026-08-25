import { useState } from 'react'
import { Pencil, RotateCcw, Trash2, Unlink } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type {
  ConversationDeletePreparation,
  ConversationLaunchPreparation,
  ConversationSummary,
  IssueRouteExecutionHostId
} from '../../../../shared/issues/types'
import { IssueRuntimeClient } from '@/issues/issue-runtime-client'
import { folderWorkspaceKey } from '../../../../shared/workspace-scope'
import { launchPreparedIssueConversation } from './issue-conversation-launch-action'
import { ConversationRenameDialog } from './ConversationRenameDialog'

export function IssueConversationList({
  route,
  conversations,
  onChanged
}: {
  route: IssueRouteExecutionHostId
  conversations: ConversationSummary[]
  onChanged(): void
}): React.JSX.Element {
  const [renameConversation, setRenameConversation] = useState<ConversationSummary | null>(null)
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">
        Direct Conversations
      </h2>
      {conversations.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-3 py-5 text-center text-sm text-muted-foreground">
          No direct Conversations
        </div>
      ) : (
        <div className="divide-y divide-border rounded-md border border-border">
          {conversations.map((conversation) => (
            <div
              key={conversation.id}
              data-conversation-id={conversation.id}
              data-attachment-state={conversation.attachment.kind}
              data-execution-state={conversation.executionState}
              className="flex items-center gap-2 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {conversation.title ?? conversation.agent}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {conversation.workspaceSnapshot.name} · {conversation.attachment.kind}
                  {conversation.unresolvedRoundCount > 0
                    ? ` · ${conversation.unresolvedRoundCount} unresolved`
                    : ''}
                </div>
              </div>
              {conversation.launchFailure ? (
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => void retryConversation(route, conversation, onChanged)}
                >
                  <RotateCcw className="size-3" />
                  Retry
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Rename Conversation"
                onClick={() => setRenameConversation(conversation)}
              >
                <Pencil className="size-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Unbind Conversation"
                onClick={() => void unbindConversation(route, conversation, onChanged)}
              >
                <Unlink className="size-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Forget Conversation"
                onClick={() => void forgetConversation(route, conversation, onChanged)}
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
      {renameConversation ? (
        <ConversationRenameDialog
          route={route}
          conversation={renameConversation}
          open
          onOpenChange={(open) => {
            if (!open) {
              setRenameConversation(null)
            }
          }}
          onChanged={onChanged}
        />
      ) : null}
    </section>
  )
}

async function unbindConversation(
  route: IssueRouteExecutionHostId,
  conversation: ConversationSummary,
  onChanged: () => void
): Promise<void> {
  try {
    await IssueRuntimeClient.forRoute(route).mutate('conversations.bindIssue', {
      mutationId: crypto.randomUUID(),
      conversationId: conversation.id,
      issueId: null,
      expectedRecordRevision: conversation.recordRevision
    })
    onChanged()
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  }
}

async function retryConversation(
  route: IssueRouteExecutionHostId,
  conversation: ConversationSummary,
  onChanged: () => void
): Promise<void> {
  const launchToken = crypto.randomUUID()
  try {
    const client = IssueRuntimeClient.forRoute(route)
    const preparation = await client.mutate<ConversationLaunchPreparation>(
      'conversations.prepareRetry',
      {
        mutationId: crypto.randomUUID(),
        conversationId: conversation.id,
        expectedRecordRevision: conversation.recordRevision,
        launchToken
      }
    )
    const outcome = await launchPreparedIssueConversation(client, preparation, {
      agent: conversation.agent,
      worktreeId:
        conversation.workspaceRef.type === 'worktree'
          ? conversation.workspaceRef.worktreeId
          : folderWorkspaceKey(conversation.workspaceRef.folderWorkspaceId),
      launchToken
    })
    onChanged()
    if (outcome.status === 'launcher-failed') {
      toast.error(outcome.message)
    }
  } catch (error) {
    onChanged()
    toast.error(error instanceof Error ? error.message : String(error))
  }
}

async function forgetConversation(
  route: IssueRouteExecutionHostId,
  conversation: ConversationSummary,
  onChanged: () => void
): Promise<void> {
  try {
    const client = IssueRuntimeClient.forRoute(route)
    const preparation = await client.mutate<ConversationDeletePreparation>(
      'conversations.prepareDelete',
      { conversationId: conversation.id }
    )
    if (!preparation.canDelete || !preparation.preflightToken) {
      toast.error(`Cannot forget: ${preparation.blockers.join(', ') || 'runtime state changed'}`)
      return
    }
    if (!window.confirm('Forget this Orca Conversation? The provider transcript will remain.')) {
      return
    }
    await client.mutate('conversations.delete', {
      mutationId: crypto.randomUUID(),
      conversationId: conversation.id,
      expectedRecordRevision: preparation.conversation.recordRevision,
      preflightToken: preparation.preflightToken
    })
    onChanged()
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  }
}
