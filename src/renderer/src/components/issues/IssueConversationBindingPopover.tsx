import { useMemo, useState } from 'react'
import { Link, Loader2 } from 'lucide-react'
import { AgentIcon, getAgentLabel } from '@/lib/agent-catalog'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useConversationSessionTitles } from '@/issues/conversation-session-titles'
import { updateConversationIssueBinding } from '@/issues/conversation-issue-binding-action'
import { issueBindingTitle } from '@/issues/issue-binding-options'
import {
  issueConversationDisplayName,
  issueConversationStatus,
  shouldShowIssueConversation,
  sortIssueConversations
} from '@/issues/issue-conversation-presentation'
import { useIssueDomainStore } from '@/issues/use-issue-domain-store'
import type {
  ConversationSummary,
  IssueRouteExecutionHostId
} from '../../../../shared/issues/types'

export function IssueConversationBindingPopover({
  route,
  issueId,
  onChanged
}: {
  route: IssueRouteExecutionHostId
  issueId: string
  onChanged: () => void
}): React.JSX.Element {
  const partition = useIssueDomainStore((state) => state.partitionsByRouteExecutionHostId[route])
  const conversations = useMemo(
    () => Object.values(partition?.conversationsById ?? {}),
    [partition?.conversationsById]
  )
  const titleSources = useMemo(
    () => conversations.map((conversation) => ({ conversation, executionHostScope: route })),
    [conversations, route]
  )
  const sessionTitles = useConversationSessionTitles(titleSources)
  const candidates = useMemo(
    () =>
      sortIssueConversations(
        conversations.filter(
          (conversation) =>
            conversation.issueId !== issueId &&
            shouldShowIssueConversation(conversation, sessionTitles, route)
        )
      ),
    [conversations, issueId, route, sessionTitles]
  )
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pendingConversationId, setPendingConversationId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const bind = async (conversation: ConversationSummary): Promise<void> => {
    if (pendingConversationId) {
      return
    }
    setPendingConversationId(conversation.id)
    setError(null)
    try {
      await updateConversationIssueBinding({ route, conversation, issueId })
      setOpen(false)
      onChanged()
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : String(mutationError))
    } finally {
      setPendingConversationId(null)
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        setQuery('')
        setError(null)
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" data-testid="issue-add-conversation-trigger">
          <Link className="size-3.5" />
          Add Conversation
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-96 p-0"
        data-testid="issue-conversation-binding-popover"
      >
        <Command aria-label="Select Conversation for Issue">
          <CommandInput
            placeholder="Search Conversations…"
            value={query}
            onValueChange={setQuery}
            autoFocus
          />
          <CommandList>
            <CommandEmpty>No matching Conversations</CommandEmpty>
            <CommandGroup heading="Conversations">
              {candidates.map((conversation) => {
                const title =
                  issueConversationDisplayName(conversation, sessionTitles, null, route) ||
                  'Untitled Conversation'
                const assignedIssue = conversation.issueId
                  ? partition?.issuesById[conversation.issueId]
                  : undefined
                const assignedLabel = assignedIssue
                  ? issueBindingTitle(assignedIssue)
                  : conversation.issueId
                    ? 'Another Issue'
                    : 'Unassigned'
                const status = issueConversationStatus(conversation).label
                const pending = pendingConversationId === conversation.id
                return (
                  <CommandItem
                    key={conversation.id}
                    className="jump-palette-item"
                    value={[
                      conversation.id,
                      title,
                      conversation.workspaceSnapshot.name,
                      getAgentLabel(conversation.agent),
                      assignedLabel
                    ].join(' ')}
                    disabled={pendingConversationId !== null}
                    data-conversation-binding-option={conversation.id}
                    onSelect={() => void bind(conversation)}
                  >
                    {pending ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <AgentIcon agent={conversation.agent} size={14} />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {conversation.workspaceSnapshot.name} · {getAgentLabel(conversation.agent)}{' '}
                        · {assignedLabel}
                        {status ? ` · ${status}` : ''}
                      </span>
                    </span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
          {error ? (
            <p className="border-t border-border px-3 py-2 text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </Command>
      </PopoverContent>
    </Popover>
  )
}
