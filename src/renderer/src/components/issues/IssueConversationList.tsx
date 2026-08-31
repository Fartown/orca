import { useMemo, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useConversationSessionTitles } from '@/issues/conversation-session-titles'
import { hasIssueConversationProviderIdentity } from '@/issues/issue-conversation-presentation'
import { activateMissingWorkspaceIssueConversation } from '@/issues/issue-conversation-navigation'
import type {
  ConversationDeletePreparation,
  ConversationSummary,
  IssueRouteExecutionHostId
} from '../../../../shared/issues/types'
import { IssueRuntimeClient } from '@/issues/issue-runtime-client'
import { ConversationRenameDialog } from './ConversationRenameDialog'
import { IssueConversationRowContent } from './IssueConversationRowContent'
import { ConversationIssueBindingPopover } from './ConversationIssueBindingPopover'

export function IssueConversationList({
  route,
  conversations,
  onChanged
}: {
  route: IssueRouteExecutionHostId
  conversations: ConversationSummary[]
  onChanged: () => void
}): React.JSX.Element {
  const visibleConversations = useMemo(
    () => conversations.filter(hasIssueConversationProviderIdentity),
    [conversations]
  )
  const titleSources = useMemo(
    () => visibleConversations.map((conversation) => ({ conversation, executionHostScope: route })),
    [route, visibleConversations]
  )
  const sessionTitles = useConversationSessionTitles(titleSources)
  const [renameConversation, setRenameConversation] = useState<ConversationSummary | null>(null)
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">
        Direct Conversations
      </h2>
      {visibleConversations.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-3 py-5 text-center text-sm text-muted-foreground">
          No direct Conversations
        </div>
      ) : (
        <div className="divide-y divide-border rounded-md border border-border">
          {visibleConversations.map((conversation) => {
            return (
              <div
                key={conversation.id}
                data-conversation-id={conversation.id}
                className="flex items-center gap-1 px-2 py-1.5"
              >
                <IssueConversationRowContent
                  conversation={conversation}
                  route={route}
                  sessionTitles={sessionTitles}
                  onMissingWorkspaceRowActivate={() =>
                    activateMissingWorkspaceIssueConversation(conversation, route)
                  }
                  fallbackClassName="rounded-md px-1 py-1 hover:bg-accent"
                />
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Rename Conversation"
                  onClick={() => setRenameConversation(conversation)}
                >
                  <Pencil className="size-3" />
                </Button>
                <ConversationIssueBindingPopover
                  route={route}
                  conversation={conversation}
                  onChanged={onChanged}
                />
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Forget Conversation"
                  onClick={() => void forgetConversation(route, conversation, onChanged)}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            )
          })}
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
