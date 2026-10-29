import { useRef, useState } from 'react'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import type { LocalTasksApi, LocalTaskWriteOutcome } from './local-tasks-api'
import { localTasksCopy } from './local-tasks-copy'
import { localTaskWriteMessage } from './local-task-failure-message'
import {
  createLocalTaskPayload,
  localTaskDraftTexts,
  localTaskOverwrite,
  localTaskPatchFor,
  type LocalTaskDraft,
  type LocalTaskFormMode
} from './local-task-form-state'
import { createLocalTaskOperationIds, sendLocalTaskWrite } from './local-task-operation-ids'
import type { LocalTasksLibrary } from './use-local-tasks-library'
import { useLocalTaskSubtaskBatch } from './use-local-task-subtask-batch'

/** One form write at a time: busy while it runs, and the task list re-read once it settles. */
function useLocalTaskFormWriteRun(library: LocalTasksLibrary) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async <T>(work: () => Promise<T>): Promise<T> => {
    setBusy(true)
    setError(null)
    try {
      return await work()
    } finally {
      setBusy(false)
      library.reload(['tasks'])
    }
  }
  return { busy, error, setError, run }
}

/**
 * The form's writes. Each step owns its operation ids, so a resend after a dropped answer replays
 * that step's first result: "Save" pressed twice after a lost reply moves and edits the task once.
 */
export function useLocalTaskFormSubmit(api: LocalTasksApi, library: LocalTasksLibrary) {
  const copy = localTasksCopy()
  const [ids] = useState(() => ({
    create: createLocalTaskOperationIds(),
    subtasks: createLocalTaskOperationIds(),
    update: createLocalTaskOperationIds(),
    move: createLocalTaskOperationIds()
  }))
  // Why called through `write.`: React Doctor reads a destructured callback from a hook holding state as a state setter.
  const write = useLocalTaskFormWriteRun(library)
  const [notice, setNotice] = useState<{ text: string; taskId: string } | null>(null)
  // The version the draft was edited from, held while another device's change awaits a decision.
  const [conflict, setConflict] = useState<LocalTask | null>(null)
  const editBase = useRef<LocalTask | null>(null)

  const fail = (outcome: LocalTaskWriteOutcome<unknown>) => {
    write.setError(localTaskWriteMessage(copy, outcome))
  }

  const subtaskBatch = useLocalTaskSubtaskBatch(api, library, copy, write.run, write.setError)

  const sendEdit = async (
    base: LocalTask,
    expectedRevision: number,
    patch: ReturnType<typeof localTaskPatchFor>
  ): Promise<string | null> => {
    if (Object.keys(patch).length === 0) {
      return base.id
    }
    const updated = await sendLocalTaskWrite(
      ids.update,
      { taskId: base.id, expectedRevision, patch },
      api.updateTask
    )
    if (updated.kind === 'refused' && updated.code === 'stale') {
      // Why held, not reported: the draft stays and the user chooses overwrite or discard.
      setConflict(base)
      return null
    }
    if (updated.kind !== 'ok') {
      fail(updated)
      return null
    }
    library.acceptTasks([updated.value.task])
    return base.id
  }

  const saveEdit = async (task: LocalTask, draft: LocalTaskDraft): Promise<string | null> => {
    let current = editBase.current?.id === task.id ? editBase.current : task
    if (draft.projectId !== current.projectId) {
      const moved = await sendLocalTaskWrite(
        ids.move,
        { taskId: task.id, targetProjectId: draft.projectId },
        api.moveTask
      )
      if (moved.kind !== 'ok') {
        fail(moved)
        return null
      }
      current = moved.value.task
      editBase.current = current
      library.acceptTasks([current])
    }
    const patch = localTaskPatchFor(draft, current)
    const saved = await sendEdit(current, current.revision, patch)
    if (saved) {
      editBase.current = null
    }
    return saved
  }

  const saveNew = async (draft: LocalTaskDraft): Promise<string | null> => {
    const created = await sendLocalTaskWrite(
      ids.create,
      createLocalTaskPayload(draft),
      api.createTask
    )
    if (created.kind !== 'ok') {
      fail(created)
      return null
    }
    const taskId = created.value.task.id
    library.acceptTasks([created.value.task])
    const titles = localTaskDraftTexts(draft.subtasks)
    if (titles.length > 0) {
      const subtasks = await sendLocalTaskWrite(
        ids.subtasks,
        { parentId: taskId, titles },
        api.createSubtasks
      )
      if (subtasks.kind === 'ok') {
        library.acceptTasks(subtasks.value.tasks)
      } else {
        // Why hold the id: the task exists, so leaving the form must open it, not retry it.
        setNotice({ text: copy.savedPartially, taskId })
        return null
      }
    }
    return taskId
  }

  return {
    busy: write.busy,
    error: write.error,
    notice: notice?.text ?? null,
    save: (mode: LocalTaskFormMode, draft: LocalTaskDraft) =>
      write.run(() => (mode.kind === 'edit' ? saveEdit(mode.task, draft) : saveNew(draft))),
    ...subtaskBatch,
    conflict: conflict !== null,
    /** Writes the user's own changes over the latest version. */
    overwrite: (draft: LocalTaskDraft) => {
      const base = conflict
      setConflict(null)
      const latest = base ? library.tasks.find((task) => task.id === base.id) : undefined
      if (!base || !latest) {
        write.setError(copy.failures.not_found)
        return Promise.resolve(null)
      }
      const plan = localTaskOverwrite(draft, base, latest)
      return write.run(() => sendEdit(base, plan.expectedRevision, plan.patch))
    },
    discard: () => setConflict(null),
    /** Closes the notice and hands back the task it was about, for the caller to open. */
    dismissNotice: (): string | null => {
      const taskId = notice?.taskId ?? null
      setNotice(null)
      return taskId
    }
  }
}
