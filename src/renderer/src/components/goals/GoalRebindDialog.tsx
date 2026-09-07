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
import { translate } from '@/i18n/i18n'
import { requestGoalDetailRefresh } from '@/goals/GoalDomainSyncGate'
import { fingerprintPayload, newClientOperationId } from '@/goals/goal-client-operation'
import { goalRuntimeClient } from '@/goals/goal-runtime-client'
import { resolveGoalBindingForPane } from '@/goals/goal-session-target'
import { goalDomainStore } from '@/goals/goals-domain-store'
import { useGoalDomainStore } from '@/goals/use-goals-domain-store'
import { GoalTargetPicker, type GoalTargetSelection } from './GoalTargetPicker'

/** Moves a paused goal onto another agent session of the same workspace; history and evidence stay. */
export function GoalRebindDialog(): React.JSX.Element {
  const goalId = useGoalDomainStore((s) => s.rebindGoalId)
  const detail = useGoalDomainStore((s) => (goalId ? s.detailsById[goalId] : undefined))
  const [target, setTarget] = useState<GoalTargetSelection>({ worktreeId: null, paneKey: null })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (goalId && detail) {
      setTarget({ worktreeId: detail.binding.worktree, paneKey: null })
      setError(null)
    }
  }, [detail, goalId])

  const close = (): void => goalDomainStore.getState().openRebind(null)

  const submit = async (): Promise<void> => {
    if (!detail || !target.worktreeId || !target.paneKey) {
      return
    }
    setPending(true)
    setError(null)
    try {
      const resolved = await resolveGoalBindingForPane(target.worktreeId, target.paneKey)
      if (!resolved.ok) {
        setError(
          translate(
            'goals.rebind.sessionUnavailable',
            'That session cannot be pinned; pick another one.'
          )
        )
        return
      }
      const envelope = {
        goalId: detail.goalId,
        expectedRuntimeFence: detail.runtimeFence,
        expectedRunId: detail.runId,
        binding: resolved.binding
      }
      const operation = await goalRuntimeClient.rebind({
        ...envelope,
        clientOperationId: newClientOperationId(),
        payloadFingerprint: await fingerprintPayload(envelope)
      })
      if (operation.status === 'rejected') {
        setError(operation.message)
        return
      }
      if (operation.status === 'accepted') {
        goalDomainStore.getState().trackOperation(operation)
      } else {
        toast.success(operation.message)
      }
      requestGoalDetailRefresh(detail.goalId)
      close()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={goalId !== null} onOpenChange={(open) => (open ? undefined : close())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{translate('goals.rebind.title', 'Change session')}</DialogTitle>
          <DialogDescription>
            {translate(
              'goals.rebind.description',
              'Pick another agent session in the same workspace. Turns, evidence and verdicts stay with the goal.'
            )}
          </DialogDescription>
        </DialogHeader>
        <GoalTargetPicker value={target} locked={false} onChange={setTarget} lockWorkspace />
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={close}>
            {translate('goals.editor.cancel', 'Cancel')}
          </Button>
          <Button type="button" disabled={pending || !target.paneKey} onClick={() => void submit()}>
            {translate('goals.rebind.confirm', 'Move goal')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
