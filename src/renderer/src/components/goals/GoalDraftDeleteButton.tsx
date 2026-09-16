import { useRef, useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { deleteGoalEditorDraft } from '@/goals/delete-goal-editor-draft'
import { GoalRuntimeClient } from '@/goals/goal-runtime-client'
import { goalEditorDraftsStore } from '@/goals/goal-editor-drafts-sync'
import type { GoalEditorDraftSummary } from '../../../../shared/goals/goal-editor-draft-contract'

export function GoalDraftDeleteButton({
  item
}: {
  item: GoalEditorDraftSummary
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lock = useRef(false)
  const client = useRef<GoalRuntimeClient | null>(null)
  const label =
    item.generation?.status === 'generating'
      ? translate('goals.drafts.stopAndDelete', 'Stop generation and delete')
      : translate('goals.drafts.delete', 'Delete draft')

  const remove = async (): Promise<void> => {
    if (lock.current || !client.current) {
      return
    }
    lock.current = true
    setPending(true)
    setError(null)
    setStopping(item.generation?.status === 'generating')
    try {
      await deleteGoalEditorDraft(item.editorDraftId, client.current, () => setStopping(true))
      setOpen(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      lock.current = false
      setPending(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!lock.current) {
          setOpen(value)
        }
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={label}
            onClick={() => {
              client.current = new GoalRuntimeClient(
                goalEditorDraftsStore.getState().routeExecutionHostId
              )
              setError(null)
              setOpen(true)
            }}
          >
            <Trash2 />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          {label}
        </TooltipContent>
      </Tooltip>
      <DialogContent showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            {translate(
              'goals.drafts.deleteDescription',
              'Remove this draft from the list. Any generation must stop first. Generated Markdown files and existing Goals are kept.'
            )}
          </DialogDescription>
        </DialogHeader>
        <p className="truncate text-sm">
          {item.objectivePreview || translate('goals.drafts.untitled', 'Untitled goal draft')}
        </p>
        {pending ? (
          <p role="status" className="text-xs text-muted-foreground">
            {stopping
              ? translate('goals.drafts.deletingStopping', 'Stopping generation…')
              : translate('goals.drafts.deleting', 'Deleting draft…')}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
            {translate('goals.editor.cancel', 'Cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() => void remove()}
          >
            {pending ? <Loader2 className="animate-spin" /> : null}
            {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
