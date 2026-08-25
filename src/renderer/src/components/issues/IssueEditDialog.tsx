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
import { Textarea } from '@/components/ui/textarea'
import { IssueRuntimeClient } from '@/issues/issue-runtime-client'
import type { IssueRecord, IssueRouteExecutionHostId } from '../../../../shared/issues/types'

export function IssueEditDialog({
  route,
  issue,
  open,
  onOpenChange,
  onChanged
}: {
  route: IssueRouteExecutionHostId
  issue: IssueRecord
  open: boolean
  onOpenChange(open: boolean): void
  onChanged(): void
}): React.JSX.Element {
  const [title, setTitle] = useState(issueTitle(issue))
  const [typeLabel, setTypeLabel] = useState(issue.typeLabel ?? '')
  const [note, setNote] = useState(issue.note ?? '')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (open) {
      setTitle(issueTitle(issue))
      setTypeLabel(issue.typeLabel ?? '')
      setNote(issue.note ?? '')
    }
  }, [issue, open])

  const save = async (): Promise<void> => {
    setPending(true)
    try {
      await IssueRuntimeClient.forRoute(route).mutate('issues.update', {
        mutationId: crypto.randomUUID(),
        issueId: issue.id,
        expectedRecordRevision: issue.recordRevision,
        title,
        typeLabel: typeLabel.trim() || null,
        note: note || null
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Issue</DialogTitle>
          <DialogDescription>Update the local title, type, and note.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="issue-edit-title">Title</Label>
            <Input
              id="issue-edit-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="issue-edit-type">Type</Label>
            <Input
              id="issue-edit-type"
              value={typeLabel}
              onChange={(event) => setTypeLabel(event.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="issue-edit-note">Note</Label>
            <Textarea
              id="issue-edit-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={pending || !title.trim()} onClick={() => void save()}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function issueTitle(issue: IssueRecord): string {
  return issue.source.kind === 'local' ? (issue.localTitle ?? '') : issue.source.titleSnapshot
}
