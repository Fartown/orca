import { useState } from 'react'
import type { LocalTask } from '../../../../shared/local-tasks/local-task-types'
import type { LocalTasksTasksUpdateInput } from '../../../../shared/local-tasks/local-tasks-rpc-params'
import { localTasksDomainStore } from '@/local-tasks/local-tasks-domain-store'
import { localTasksSync } from '@/local-tasks/local-tasks-sync'
import { localTaskIdEndpoint } from '@/local-tasks/local-task-endpoints'
import { saveLocalTaskPatch, type LocalTaskPatchOutcome } from '@/local-tasks/local-task-writes'

type Draft<E> = { value: E; base: E; baseRevision: number }
type RevisionedFieldEntity = { id: string; revision: number }

export type LocalTaskFieldDraft<E> = {
  value: E
  conflict: boolean
  saving: boolean
  edit: (next: E) => void
  commit: () => Promise<void>
  commitValue: (next: E) => Promise<void>
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
export function useRevisionedFieldDraft<E, T extends RevisionedFieldEntity, P>({
  task,
  stored,
  read,
  same,
  toPatch,
  save,
  latest,
  refresh
}: {
  task: T
  stored: E
  read: (task: T) => E
  same: (a: E, b: E) => boolean
  toPatch: (value: E) => P
  save: (id: string, patch: P, revision: number) => Promise<LocalTaskPatchOutcome>
  latest: (id: string) => T | undefined
  refresh: () => Promise<void>
}): LocalTaskFieldDraft<E> {
  const [draft, setDraft] = useState<Draft<E> | null>(null)
  const [conflict, setConflict] = useState(false)
  const [saving, setSaving] = useState(false)

  const settle = (outcome: LocalTaskPatchOutcome, committed: E): void => {
    if (outcome === 'saved') {
      const currentEntity = latest(task.id)
      if (currentEntity && !same(read(currentEntity), committed)) {
        setConflict(true)
        return
      }
      setConflict(false)
      setDraft((current) => {
        if (!current) {
          return null
        }
        if (same(current.value, committed)) {
          return null
        }
        return {
          ...current,
          base: committed,
          baseRevision: currentEntity?.revision ?? current.baseRevision
        }
      })
    } else if (outcome === 'stale') {
      setConflict(true)
    }
  }

  const commitValue = async (value: E): Promise<void> => {
    if (saving || conflict) {
      return
    }
    const editing = draft ?? { value, base: stored, baseRevision: task.revision }
    if (same(value, stored)) {
      setDraft(null)
      return
    }
    setSaving(true)
    const committed = value
    let outcome = await save(task.id, toPatch(committed), editing.baseRevision)
    if (outcome === 'stale') {
      await refresh()
      const currentTask = latest(task.id)
      // Why: the revision covers the whole task; another field changing elsewhere is no conflict.
      if (currentTask && same(read(currentTask), editing.base)) {
        outcome = await save(task.id, toPatch(committed), currentTask.revision)
      }
    }
    setSaving(false)
    settle(outcome, committed)
  }
  const commit = (): Promise<void> => (draft ? commitValue(draft.value) : Promise.resolve())

  const overwrite = async (): Promise<void> => {
    const currentTask = latest(task.id)
    if (!draft || !currentTask || saving) {
      return
    }
    setSaving(true)
    const committed = draft.value
    const outcome = await save(task.id, toPatch(committed), currentTask.revision)
    if (outcome === 'stale') {
      await refresh()
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
    commitValue,
    overwrite,
    discard: () => {
      setDraft(null)
      setConflict(false)
    }
  }
}

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
  return useRevisionedFieldDraft({
    task,
    stored,
    read,
    same,
    toPatch,
    save: saveLocalTaskPatch,
    latest: latestTask,
    refresh: () => localTasksSync.refresh(['tasks'], localTaskIdEndpoint(task.id))
  })
}
