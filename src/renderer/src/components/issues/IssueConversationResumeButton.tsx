import { useEffect, useState, useSyncExternalStore } from 'react'
import { Loader2, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  isIssueConversationResumePending,
  resumeIssueConversationWithAiVault,
  subscribeIssueConversationResumePending
} from '@/issues/issue-conversation-resume'
import type {
  ConversationSummary,
  IssueRouteExecutionHostId
} from '../../../../shared/issues/types'

export function IssueConversationResumeButton({
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
  const pending = useSyncExternalStore(
    subscribeIssueConversationResumePending,
    () => isIssueConversationResumePending(route, conversation.id),
    () => false
  )
  const [showPending, setShowPending] = useState(false)

  useEffect(() => {
    if (!pending) {
      setShowPending(false)
      return
    }
    const timer = window.setTimeout(() => setShowPending(true), 200)
    return () => window.clearTimeout(timer)
  }, [pending])

  const resume = async (event: React.MouseEvent<HTMLButtonElement>): Promise<void> => {
    event.stopPropagation()
    if (isIssueConversationResumePending(route, conversation.id)) {
      return
    }
    try {
      await resumeIssueConversationWithAiVault(route, conversation)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      onChanged?.()
    }
  }

  const icon = showPending ? (
    <Loader2 className="size-3 animate-spin" />
  ) : (
    <RotateCcw className="size-3" />
  )
  if (!compact) {
    return (
      <Button
        variant="outline"
        size="xs"
        disabled={pending}
        onClick={(event) => void resume(event)}
      >
        {icon}
        Resume
      </Button>
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={pending}
          aria-label="Resume Conversation"
          onClick={(event) => void resume(event)}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        Resume Conversation
      </TooltipContent>
    </Tooltip>
  )
}
