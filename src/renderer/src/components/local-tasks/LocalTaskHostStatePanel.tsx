import { useState } from 'react'
import { AlertCircle, ChevronDown, ChevronRight, LoaderCircle, Lock, ServerOff } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { translate } from '@/i18n/i18n'
import { describeLocalTasksUnavailableReason } from '@/local-tasks/local-task-host-state-copy'
import { localTasksDomainStore, useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import {
  describeLocalTaskLibraryNotices,
  type LocalTaskLibraryNotice
} from '@/local-tasks/local-task-library-notices'
import { selectExecutionHostDisplayLabel } from '@/lib/execution-host-display-label'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import type { LocalTaskChangeScope } from '../../../../shared/local-tasks/local-task-types'
import { localTasksSync } from '@/local-tasks/local-tasks-sync'

type PanelCopy = {
  busy: boolean
  message: string
  explanation: string | null
  detail: string | null
  /** The button that opens the stream again; only the user's click does. */
  retry: string | null
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
      retry: translate('localTasks.state.retryRead', 'Retry')
    }
  }
  if (connection === 'unsupported') {
    return {
      busy: false,
      message: translate(
        'localTasks.state.unsupported',
        'The Orca on this host needs an update before it can keep tasks.'
      ),
      explanation: null,
      detail: null,
      retry: null
    }
  }
  if (connection === 'ended') {
    return {
      busy: false,
      message: translate('localTasks.state.ended', 'The task library stopped sending updates.'),
      explanation: null,
      detail: null,
      retry: translate('localTasks.state.retry', 'Reconnect')
    }
  }
  if (connection === 'connecting' || hostState === null || hostState === 'starting') {
    return {
      busy: true,
      message: translate('localTasks.state.starting', 'Opening the task library…'),
      explanation: null,
      detail: null,
      retry: null
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
      retry: null
    }
  }
  return {
    busy: false,
    message: translate(
      'localTasks.state.notTaskHost',
      'No task library is connected here. Connect to an Orca that keeps one, or update it.'
    ),
    explanation: null,
    detail: null,
    retry: null
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
            {copy.retry}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

/** Re-reads the page's own library; another Orca's failures retry from their own line. */
export function refreshHomeLibrary(scopes: LocalTaskChangeScope[] | null): Promise<void> {
  const { home } = localTasksDomainStore.getState()
  return home ? localTasksSync.refresh(scopes, home) : Promise.resolve()
}

/** A failed read needs an explicit retry because reads only follow host change notices. */
export function LocalTaskReadErrorPanel({
  detail,
  onRetry,
  compact = false
}: {
  detail: string
  onRetry?: () => void
  compact?: boolean
}): React.JSX.Element {
  return (
    <div
      className={
        compact
          ? 'rounded-md border border-border/60 bg-muted/30 px-3 py-2'
          : 'flex flex-1 items-center justify-center p-8'
      }
    >
      <div
        role="alert"
        className={
          compact
            ? 'flex flex-wrap items-center gap-2'
            : 'flex max-w-md flex-col items-center gap-3 text-center'
        }
      >
        <AlertCircle
          className={compact ? 'size-4 text-muted-foreground' : 'size-5 text-muted-foreground'}
        />
        <p className="text-sm text-foreground">
          {translate('localTasks.state.readFailed', 'Could not load local tasks.')}
        </p>
        <TechnicalDetail detail={detail} />
        <Button
          variant="outline"
          size="sm"
          onClick={() => (onRetry ? onRetry() : void refreshHomeLibrary(null))}
        >
          {translate('localTasks.state.retryRead', 'Retry')}
        </Button>
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

function runLibraryRetry(notice: LocalTaskLibraryNotice): void {
  if (notice.retry?.kind === 'resubscribe') {
    localTasksDomainStore.getState().retry(notice.endpoint)
  } else if (notice.retry?.kind === 'read') {
    void localTasksSync.refresh(notice.retry.scopes, notice.endpoint)
  }
}

/** One line per library the page cannot fully show now, each with its own retry. */
export function LocalTaskLibraryNotices(): React.JSX.Element | null {
  const partitions = useLocalTasksDomain((state) => state.partitions)
  const home = useLocalTasksDomain((state) => state.home)
  const labels = useAppStore(
    useShallow((state) =>
      partitions.map((partition) => selectExecutionHostDisplayLabel(state, partition.endpoint))
    )
  )
  const notices = describeLocalTaskLibraryNotices(
    partitions,
    home,
    (endpoint) =>
      labels[partitions.findIndex((partition) => partition.endpoint === endpoint)] ?? endpoint
  )
  if (notices.length === 0) {
    return null
  }
  return (
    <div className="flex flex-col gap-1">
      {notices.map((notice) => (
        <div
          key={notice.endpoint}
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground"
        >
          <ServerOff
            className={cn('size-3.5 shrink-0', notice.tone === 'warning' && 'text-destructive')}
          />
          <span className="min-w-0 flex-1">{notice.text}</span>
          {notice.detail ? <TechnicalDetail detail={notice.detail} /> : null}
          {notice.retry ? (
            <Button variant="ghost" size="xs" onClick={() => runLibraryRetry(notice)}>
              {translate('localTasks.state.retryRead', 'Retry')}
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  )
}
