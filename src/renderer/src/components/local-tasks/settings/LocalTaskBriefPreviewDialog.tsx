import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import {
  buildLocalTaskBrief,
  LOCAL_TASK_WORKER_GUIDE
} from '../../../../../shared/local-tasks/local-task-brief'

function BriefText({ text }: { text: string }): React.JSX.Element {
  return (
    <pre className="rounded-md border border-border/60 bg-muted/40 p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-foreground select-text">
      {text}
    </pre>
  )
}

/** The exact text agents get: the brief appended to the first instruction, and the guide it points to. */
export function LocalTaskBriefPreviewDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const prefix = useLocalTasksDomain((state) => state.projects[0]?.prefix ?? 'TASK')
  const ref = `${prefix}-1`
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent scrollable className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{translate('localTasks.settings.brief', 'Task brief')}</DialogTitle>
          <DialogDescription>
            {translate(
              'localTasks.settings.briefAppended',
              'Added after the first instruction of a session started from a task, shown here for {{ref}}:',
              { ref }
            )}
          </DialogDescription>
        </DialogHeader>
        <BriefText text={buildLocalTaskBrief(ref)} />
        <p className="text-sm text-muted-foreground">
          {translate(
            'localTasks.settings.briefGuide',
            'The rules the agent reads with orca task guide when it needs them:'
          )}
        </p>
        <BriefText text={LOCAL_TASK_WORKER_GUIDE} />
      </DialogContent>
    </Dialog>
  )
}
