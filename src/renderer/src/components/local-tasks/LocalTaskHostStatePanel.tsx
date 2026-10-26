import { useState } from 'react'
import { AlertCircle, ChevronDown, ChevronRight, LoaderCircle, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { translate } from '@/i18n/i18n'
import { describeLocalTasksUnavailableReason } from '@/local-tasks/local-task-host-state-copy'
import { localTasksDomainStore, useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'

type PanelCopy = {
  busy: boolean
  message: string
  explanation: string | null
  detail: string | null
  retry: boolean
}

function usePanelCopy(): PanelCopy {
  const connection = useLocalTasksDomain((state) => state.connection)
  const hostState = useLocalTasksDomain((state) => state.hostState)
  const reason = useLocalTasksDomain((state) => state.hostReason)
  if (connection === 'failed') {
    return {
      busy: false,
      message: translate('localTasks.state.failed', 'Could not reach the task library.'),
      explanation: null,
      detail: reason,
      retry: true
    }
  }
  if (connection === 'ended') {
    return {
      busy: false,
      message: translate('localTasks.state.ended', 'The task library stopped sending updates.'),
      explanation: null,
      detail: null,
      retry: true
    }
  }
  if (connection === 'connecting' || hostState === null || hostState === 'starting') {
    return {
      busy: true,
      message: translate('localTasks.state.starting', 'Opening the task library…'),
      explanation: null,
      detail: null,
      retry: false
    }
  }
  if (hostState === 'unavailable') {
    return {
      busy: false,
      message: translate(
        'localTasks.state.unavailable',
        'Local tasks cannot be shown or changed right now.'
      ),
      explanation: describeLocalTasksUnavailableReason(reason),
      detail: reason,
      retry: false
    }
  }
  return {
    busy: false,
    message: translate(
      'localTasks.state.notTaskHost',
      'Local tasks are kept by the desktop Orca, and this window cannot reach them.'
    ),
    explanation: null,
    detail: null,
    retry: false
  }
}

/** The host's own words, folded away; they help a bug report more than a reader. */
function TechnicalDetail({ detail }: { detail: string }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="w-full">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="xs">
          {open ? <ChevronDown /> : <ChevronRight />}
          {translate('localTasks.state.technicalDetails', 'Technical details')}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <p className="mt-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-left font-mono text-xs break-words text-muted-foreground select-text">
          {detail}
        </p>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** Shown instead of the task views until the library is ready or read-only. */
export function LocalTaskHostStatePanel(): React.JSX.Element {
  const copy = usePanelCopy()
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div role="status" className="flex max-w-md flex-col items-center gap-3 text-center">
        {copy.busy ? (
          <LoaderCircle className="size-5 animate-spin text-muted-foreground motion-reduce:animate-none" />
        ) : (
          <AlertCircle className="size-5 text-muted-foreground" />
        )}
        <p className="text-sm text-foreground">{copy.message}</p>
        {copy.explanation ? (
          <p className="text-xs text-muted-foreground">{copy.explanation}</p>
        ) : null}
        {copy.detail ? <TechnicalDetail detail={copy.detail} /> : null}
        {copy.retry ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => localTasksDomainStore.getState().retry()}
          >
            {translate('localTasks.state.retry', 'Reconnect')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

/** A library written by a newer Orca opens read-only; say why instead of only greying buttons. */
export function LocalTaskReadOnlyNotice(): React.JSX.Element | null {
  const readOnly = useLocalTasksDomain(
    (state) => state.connection === 'live' && state.hostState === 'read-only'
  )
  if (!readOnly) {
    return null
  }
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
    >
      <Lock className="mt-0.5 size-3.5 shrink-0" />
      <span>
        {translate(
          'localTasks.state.readOnlyNotice',
          'Read only: a newer version of Orca saved these tasks, so this version can show them but not change them. Update Orca to edit them again.'
        )}
      </span>
    </div>
  )
}
