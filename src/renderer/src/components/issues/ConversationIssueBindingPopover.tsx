import { useMemo, useState } from 'react'
import { Check, Link, Loader2, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  loadActiveIssueBindingOptions,
  updateConversationIssueBinding
} from '@/issues/conversation-issue-binding-action'
import { buildIssueBindingOptions } from '@/issues/issue-binding-options'
import { useIssueDomainStore } from '@/issues/use-issue-domain-store'
import type {
  ConversationSummary,
  IssueRouteExecutionHostId
} from '../../../../shared/issues/types'

export function ConversationIssueBindingPopover({
  route,
  conversation,
  compact = false,
  onChanged
}: {
  route: IssueRouteExecutionHostId
  conversation: ConversationSummary
  compact?: boolean
  onChanged?: () => void
}): React.JSX.Element {
  const partition = useIssueDomainStore((state) => state.partitionsByRouteExecutionHostId[route])
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingIssueId, setPendingIssueId] = useState<string | null | undefined>()
  const [error, setError] = useState<string | null>(null)
  const options = useMemo(
    () => buildIssueBindingOptions(Object.values(partition?.issuesById ?? {})),
    [partition?.issuesById]
  )
  const actionLabel = conversation.issueId
    ? 'Move Conversation to Issue'
    : 'Add Conversation to Issue'

  const handleOpenChange = (nextOpen: boolean): void => {
    setOpen(nextOpen)
    setQuery('')
    setError(null)
    if (!nextOpen) {
      return
    }
    setLoading(true)
    void loadActiveIssueBindingOptions(route)
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : String(loadError))
      })
      .finally(() => setLoading(false))
  }

  const bind = async (issueId: string | null): Promise<void> => {
    if (pendingIssueId !== undefined || issueId === conversation.issueId) {
      return
    }
    setPendingIssueId(issueId)
    setError(null)
    try {
      await updateConversationIssueBinding({ route, conversation, issueId })
      setOpen(false)
      onChanged?.()
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : String(mutationError))
    } finally {
      setPendingIssueId(undefined)
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={actionLabel}
              data-testid="conversation-issue-binding-trigger"
              className={
                compact
                  ? 'size-5 can-hover:opacity-0 group-hover/agent-row:opacity-100 group-focus-within/agent-row:opacity-100 group-hover/compact-agent-row:opacity-100 group-focus-within/compact-agent-row:opacity-100 group-hover/issue-conversation:opacity-100 group-focus-within/issue-conversation:opacity-100 data-[state=open]:opacity-100 focus-visible:opacity-100'
                  : undefined
              }
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <Link className="size-3" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          {actionLabel}
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        className="w-80 p-0"
        data-testid="conversation-issue-binding-popover"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <Command aria-label="Select Issue for Conversation">
          <CommandInput
            placeholder="Search Issues…"
            value={query}
            onValueChange={setQuery}
            autoFocus
          />
          <CommandList>
            <CommandEmpty>
              {loading ? 'Loading Issues…' : error ? 'Unable to load Issues' : 'No matching Issues'}
            </CommandEmpty>
            {options.length > 0 ? (
              <CommandGroup heading="Issues">
                {options.map((option) => {
                  const current = option.issue.id === conversation.issueId
                  const pending = pendingIssueId === option.issue.id
                  return (
                    <CommandItem
                      key={option.issue.id}
                      className="jump-palette-item"
                      value={`${option.issue.id} ${option.searchValue}`}
                      disabled={current || pendingIssueId !== undefined}
                      data-issue-binding-option={option.issue.id}
                      onSelect={() => void bind(option.issue.id)}
                    >
                      {pending ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <span className="size-3.5 shrink-0" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{option.title}</span>
                        {option.path !== option.title ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {option.path}
                          </span>
                        ) : null}
                      </span>
                      {current ? (
                        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                          <Check className="size-3" />
                          Current
                        </span>
                      ) : null}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            ) : null}
            {conversation.issueId ? (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    className="jump-palette-item"
                    value="remove unassign conversation issue"
                    disabled={pendingIssueId !== undefined}
                    data-testid="conversation-issue-unbind"
                    onSelect={() => void bind(null)}
                  >
                    {pendingIssueId === null ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Unlink className="size-3.5" />
                    )}
                    Remove from Issue
                  </CommandItem>
                </CommandGroup>
              </>
            ) : null}
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
