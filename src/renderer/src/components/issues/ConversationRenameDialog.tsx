import { useEffect, useRef, useState } from 'react'
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
import { translate } from '@/i18n/i18n'

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

  // Reseed only when the dialog opens: Provider snapshot refreshes update the
  // conversation prop while it is open and must not clobber the user's typing.
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open && !wasOpen.current) {
      setTitle(conversation.title ?? '')
    }
    wasOpen.current = open
  }, [conversation, open])

  const save = async (): Promise<void> => {
    // Saving the prefilled name unchanged must not freeze an automatic title
    // as a manual rename (and needs no round-trip at all).
    if (title.trim() === (conversation.title ?? '').trim()) {
      onOpenChange(false)
      return
    }
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
          <DialogTitle>
            {translate(
              'auto.components.issues.ConversationRenameDialog.55087a9d88',
              'Rename Conversation'
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.issues.ConversationRenameDialog.d2f7c5b470',
              'Use one title in both Workspaces and Issues.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="conversation-rename-title">
            {translate('auto.components.issues.ConversationRenameDialog.293fb382e4', 'Title')}
          </Label>
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
            {translate('auto.components.issues.ConversationRenameDialog.472afc54a2', 'Cancel')}
          </Button>
          <Button disabled={pending} onClick={() => void save()}>
            {pending
              ? translate('auto.components.issues.ConversationRenameDialog.72a7684dd9', 'Saving…')
              : translate('auto.components.issues.ConversationRenameDialog.2fc85442bc', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
