import { useState } from 'react'
import { Archive, ArchiveRestore, Pause, Pencil, Play, Repeat, Square } from 'lucide-react'
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
import { translate } from '@/i18n/i18n'
import type {
  GoalControlAction,
  GoalDetail,
  GoalOperation
} from '../../../../shared/goals/goal-control-contract'
import { requestGoalDetailRefresh } from '@/goals/GoalDomainSyncGate'
import { fingerprintPayload, newClientOperationId } from '@/goals/goal-client-operation'
import { goalRuntimeClient } from '@/goals/goal-runtime-client'
import { goalDomainStore } from '@/goals/goals-domain-store'
import { useGoalDomainStore } from '@/goals/use-goals-domain-store'

/**
 * Pause, resume, stop, edit, change session, archive. Buttons never claim more
 * than the receipt says: an accepted request reads as "requested" until the
 * driver confirms it, and a stop only reads as stopped once the turn ended.
 */
export function GoalControls({ detail }: { detail: GoalDetail }): React.JSX.Element {
  const pending = useGoalDomainStore((s) =>
    Object.values(s.pendingOperations).find((operation) => operation.goalId === detail.goalId)
  )
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [confirmStop, setConfirmStop] = useState(false)
  const terminal = detail.phase === 'complete' || detail.phase === 'budget_exhausted'
  const driverGone = detail.driver.status === 'exited'
  const quiescent = driverGone || detail.continuation === 'paused'
  const canPause = !terminal && detail.continuation === 'enabled' && !driverGone
  const canResume =
    !terminal &&
    (detail.continuation === 'paused' || detail.phase === 'interrupted' || detail.phase === 'idle')
  const canStop = !terminal && !driverGone
  const canEdit = quiescent && !detail.archived
  const busy = submitting !== null || pending !== undefined

  const submit = async (
    label: string,
    call: (clientOperationId: string) => Promise<GoalOperation>
  ): Promise<void> => {
    setSubmitting(label)
    try {
      reportOperation(await call(newClientOperationId()))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setSubmitting(null)
      requestGoalDetailRefresh(detail.goalId)
    }
  }

  const control = (action: GoalControlAction): Promise<void> =>
    submit(action, async (clientOperationId) => {
      const envelope = {
        goalId: detail.goalId,
        expectedRuntimeFence: detail.runtimeFence,
        expectedRunId: detail.runId,
        action
      }
      return goalRuntimeClient.control({
        ...envelope,
        clientOperationId,
        payloadFingerprint: await fingerprintPayload(envelope)
      })
    })

  const archive = (archived: boolean): Promise<void> =>
    submit('archive', async (clientOperationId) => {
      const envelope = {
        goalId: detail.goalId,
        expectedRuntimeFence: detail.runtimeFence,
        expectedRunId: detail.runId,
        archived
      }
      return goalRuntimeClient.archive({
        ...envelope,
        clientOperationId,
        payloadFingerprint: await fingerprintPayload(envelope)
      })
    })

  return (
    <section className="space-y-1">
      <div className="flex flex-wrap items-center gap-1">
        {canPause ? (
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={busy}
            onClick={() => void control('pause')}
          >
            <Pause />
            {translate('goals.controls.pause', 'Pause continuation')}
          </Button>
        ) : null}
        {canResume ? (
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={busy}
            onClick={() => void control('resume')}
          >
            <Play />
            {translate('goals.controls.resume', 'Resume')}
          </Button>
        ) : null}
        {canStop ? (
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={busy}
            onClick={() => setConfirmStop(true)}
          >
            <Square />
            {translate('goals.controls.stop', 'Stop')}
          </Button>
        ) : null}
        {canEdit ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={busy}
            onClick={() =>
              goalDomainStore.getState().openEditor({
                worktreeId: detail.binding.worktree,
                paneKey: null,
                goalId: detail.goalId
              })
            }
          >
            <Pencil />
            {translate('goals.controls.edit', 'Edit')}
          </Button>
        ) : null}
        {canEdit ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={busy}
            onClick={() => goalDomainStore.getState().openRebind(detail.goalId)}
          >
            <Repeat />
            {translate('goals.controls.changeSession', 'Change session')}
          </Button>
        ) : null}
        {driverGone || terminal ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={busy}
            onClick={() => void archive(!detail.archived)}
          >
            {detail.archived ? <ArchiveRestore /> : <Archive />}
            {detail.archived
              ? translate('goals.controls.unarchive', 'Unarchive')
              : translate('goals.controls.archive', 'Archive')}
          </Button>
        ) : null}
      </div>
      {!canEdit && !terminal && !detail.archived ? (
        <p className="text-[11px] text-muted-foreground">
          {translate(
            'goals.controls.pauseToEdit',
            'Pause continuation to edit the goal or change its session.'
          )}
        </p>
      ) : null}
      {pending ? (
        <p className="text-[11px] text-muted-foreground" role="status">
          {translate(
            'goals.controls.awaitingDriver',
            'Requested; waiting for the driver to confirm.'
          )}
        </p>
      ) : null}
      <Dialog open={confirmStop} onOpenChange={setConfirmStop}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{translate('goals.controls.stopTitle', 'Stop this goal?')}</DialogTitle>
            <DialogDescription>
              {translate(
                'goals.controls.stopDescription',
                'Injection stops now and the round in flight gets an interrupt. The goal only reads as stopped once the agent confirms the turn ended; the session itself stays open.'
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setConfirmStop(false)}>
              {translate('goals.controls.keepRunning', 'Keep running')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setConfirmStop(false)
                void control('stop')
              }}
            >
              {translate('goals.controls.stopConfirm', 'Stop goal')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function reportOperation(operation: GoalOperation): void {
  if (operation.status === 'rejected') {
    toast.error(operation.message)
    return
  }
  if (operation.status === 'applied') {
    if (operation.code === 'confirmation_pending') {
      toast.warning(operation.message)
    } else {
      toast.success(operation.message)
    }
    return
  }
  goalDomainStore.getState().trackOperation(operation)
}
