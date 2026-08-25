import { useEffect, useState } from 'react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { IssueRuntimeClient } from '@/issues/issue-runtime-client'
import type {
  ConversationSummary,
  IssueRouteExecutionHostId
} from '../../../../shared/issues/types'

export function ConversationRenameDialog({
  route,
  conversation,
  open,
  onOpenChange,
  onChanged
}: {
  route: IssueRouteExecutionHostId
  conversation: ConversationSummary
  open: boolean
  onOpenChange(open: boolean): void
  onChanged(): void
}): React.JSX.Element {
  const [title, setTitle] = useState(conversation.title ?? '')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (open) {
      setTitle(conversation.title ?? '')
    }
  }, [conversation, open])

  const save = async (): Promise<void> => {
    setPending(true)
    try {
      await IssueRuntimeClient.forRoute(route).mutate('conversations.update', {
        mutationId: crypto.randomUUID(),
        conversationId: conversation.id,
        expectedRecordRevision: conversation.recordRevision,
        title: title.trim() || null
      })
      onOpenChange(false)
      onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename Conversation</DialogTitle>
          <DialogDescription>Use one title in both Workspaces and Issues.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="conversation-rename-title">Title</Label>
          <Input
            id="conversation-rename-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={conversation.agent}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={pending} onClick={() => void save()}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
