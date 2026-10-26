import { useState } from 'react'
import type { LocalTask } from '../../../../shared/local-tasks/local-task-types'
import type { LocalTasksTasksUpdateInput } from '../../../../shared/local-tasks/local-tasks-rpc-params'
import { localTasksDomainStore } from '@/local-tasks/local-tasks-domain-store'
import { localTasksSync } from '@/local-tasks/local-tasks-sync'
import { saveLocalTaskPatch, type LocalTaskPatchOutcome } from '@/local-tasks/local-task-writes'

type Draft<E> = { value: E; base: E; baseRevision: number }

export type LocalTaskFieldDraft<E> = {
  value: E
  conflict: boolean
  saving: boolean
  edit: (next: E) => void
  commit: () => Promise<void>
  overwrite: () => Promise<void>
  discard: () => void
}

function latestTask(taskId: string): LocalTask | undefined {
  return localTasksDomainStore.getState().tasks.find((task) => task.id === taskId)
}

/**
 * One editable task field. Without a draft it follows the stored value as changes arrive; with a
 * draft it keeps the user's text, saves against the revision the edit started from, and on `stale`
 * keeps the draft and asks whether to overwrite or discard (REQ-017).
 */
export function useLocalTaskFieldDraft<E>({
  task,
  stored,
  read,
  same,
  toPatch
}: {
  task: LocalTask
  stored: E
  read: (task: LocalTask) => E
  same: (a: E, b: E) => boolean
  toPatch: (value: E) => LocalTasksTasksUpdateInput['patch']
}): LocalTaskFieldDraft<E> {
  const [draft, setDraft] = useState<Draft<E> | null>(null)
  const [conflict, setConflict] = useState(false)
  const [saving, setSaving] = useState(false)

  const settle = (outcome: LocalTaskPatchOutcome, committed: E): void => {
    if (outcome === 'saved') {
      setConflict(false)
      setDraft((current) => (current && same(current.value, committed) ? null : current))
    } else if (outcome === 'stale') {
      setConflict(true)
    }
  }

  const commit = async (): Promise<void> => {
    if (!draft || saving || conflict) {
      return
    }
    if (same(draft.value, stored)) {
      setDraft(null)
      return
    }
    setSaving(true)
    const committed = draft.value
    let outcome = await saveLocalTaskPatch(task.id, toPatch(committed), draft.baseRevision)
    if (outcome === 'stale') {
      await localTasksSync.refresh(['tasks'])
      const latest = latestTask(task.id)
      // Why: the revision covers the whole task; another field changing elsewhere is no conflict.
      if (latest && same(read(latest), draft.base)) {
        outcome = await saveLocalTaskPatch(task.id, toPatch(committed), latest.revision)
      }
    }
    setSaving(false)
    settle(outcome, committed)
  }

  const overwrite = async (): Promise<void> => {
    const latest = latestTask(task.id)
    if (!draft || !latest || saving) {
      return
    }
    setSaving(true)
    const committed = draft.value
    const outcome = await saveLocalTaskPatch(task.id, toPatch(committed), latest.revision)
    if (outcome === 'stale') {
      await localTasksSync.refresh(['tasks'])
    }
    setSaving(false)
    settle(outcome, committed)
  }

  return {
    value: draft ? draft.value : stored,
    conflict,
    saving,
    edit: (next) =>
      setDraft((current) =>
        current
          ? { ...current, value: next }
          : { value: next, base: stored, baseRevision: task.revision }
      ),
    commit,
    overwrite,
    discard: () => {
      setDraft(null)
      setConflict(false)
    }
  }
}
