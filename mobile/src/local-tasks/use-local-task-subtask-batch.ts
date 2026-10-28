import { useRef, useState } from 'react'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import type { LocalTasksApi, LocalTaskWriteOutcome } from './local-tasks-api'
import type { LocalTasksCopy } from './local-tasks-copy'
import { localTaskWriteMessage } from './local-task-failure-message'
import {
  localTaskDraftTexts,
  parseLocalTaskLabels,
  type LocalTaskDraft
} from './local-task-form-state'
import { createLocalTaskOperationIds, sendLocalTaskWrite } from './local-task-operation-ids'
import type { LocalTasksLibrary } from './use-local-tasks-library'

/** Resumes a pasted subtask batch on the same children after any partial or unknown write. */
export function useLocalTaskSubtaskBatch(
  api: LocalTasksApi,
  library: LocalTasksLibrary,
  copy: LocalTasksCopy,
  run: <T>(work: () => Promise<T>) => Promise<T>,
  setError: (message: string | null) => void
) {
  const [ids] = useState(() => ({
    subtasks: createLocalTaskOperationIds(),
    batch: createLocalTaskOperationIds(),
    criteria: createLocalTaskOperationIds()
  }))
  const [partialTaskId, setPartialTaskId] = useState<string | null>(null)
  const [subtaskRetryPending, setSubtaskRetryPending] = useState(false)
  const subtaskIntent = useRef<{ key: string; titles: string[] } | null>(null)
  const pendingSubtasks = useRef<{
    key: string
    titles: string[]
    tasks: LocalTask[]
    batchKey: string | null
    batchLabels: string[]
    batchPriorityWritten: boolean
    batchUnsettled: {
      key: string
      labels: string[]
      patch: {
        statusId?: string
        priority?: LocalTask['priority']
        addLabels?: string[]
        removeLabels?: string[]
      }
    } | null
    criteriaKey: string | null
    criteriaDone: number
    criteriaClearing: boolean
    criteriaUnsettled: { taskId: string; criteria: string[] } | null
  } | null>(null)
  const fail = (outcome: LocalTaskWriteOutcome<unknown>) => {
    setError(localTaskWriteMessage(copy, outcome))
  }

  const createSubtasks = (parent: LocalTask, titles: string[], draft: LocalTaskDraft) =>
    run(async () => {
      const key = JSON.stringify({ parentId: parent.id, titles })
      if (subtaskIntent.current && subtaskIntent.current.key !== key) {
        setError(copy.subtasksAlreadyCreated)
        return false
      }
      subtaskIntent.current = { key, titles }
      setSubtaskRetryPending(true)
      if (!pendingSubtasks.current) {
        const created = await sendLocalTaskWrite(
          ids.subtasks,
          { parentId: parent.id, titles },
          api.createSubtasks
        )
        if (created.kind !== 'ok') {
          fail(created)
          if (created.kind !== 'unknown') {
            subtaskIntent.current = null
            setSubtaskRetryPending(false)
          }
          return false
        }
        library.acceptTasks(created.value.tasks)
        pendingSubtasks.current = {
          key,
          titles,
          tasks: created.value.tasks,
          batchKey: null,
          batchLabels: [],
          batchPriorityWritten: false,
          batchUnsettled: null,
          criteriaKey: null,
          criteriaDone: 0,
          criteriaClearing: false,
          criteriaUnsettled: null
        }
        setPartialTaskId(parent.id)
      }
      const pending = pendingSubtasks.current
      const taskIds = pending.tasks.map((task) => task.id)
      if (pending.batchUnsettled) {
        const unsettled = pending.batchUnsettled
        const settled = await sendLocalTaskWrite(
          ids.batch,
          { taskIds, patch: unsettled.patch },
          api.batchUpdate
        )
        if (settled.kind !== 'ok') {
          if (settled.kind !== 'unknown') {
            pending.batchUnsettled = null
          }
          setError(`${copy.subtasksPartiallySaved} ${localTaskWriteMessage(copy, settled) ?? ''}`)
          return false
        }
        pending.batchKey = unsettled.key
        pending.batchLabels = unsettled.labels
        pending.batchPriorityWritten = unsettled.patch.priority !== undefined
        pending.batchUnsettled = null
      }
      const labels = parseLocalTaskLabels(draft.labelsText)
      const removedLabels = pending.batchLabels.filter((label) => !labels.includes(label))
      const batchPatch = {
        ...(draft.statusId ? { statusId: draft.statusId } : {}),
        ...(draft.priority !== 0 || pending.batchPriorityWritten
          ? { priority: draft.priority }
          : {}),
        ...(labels.length > 0 ? { addLabels: labels } : {}),
        ...(removedLabels.length > 0 ? { removeLabels: removedLabels } : {})
      }
      const batchKey = JSON.stringify(batchPatch)
      if (
        pending.batchKey !== batchKey &&
        taskIds.length > 0 &&
        Object.keys(batchPatch).length > 0
      ) {
        const updated = await sendLocalTaskWrite(
          ids.batch,
          { taskIds, patch: batchPatch },
          api.batchUpdate
        )
        if (updated.kind !== 'ok') {
          if (updated.kind === 'unknown') {
            pending.batchUnsettled = { key: batchKey, labels, patch: batchPatch }
          }
          setError(`${copy.subtasksPartiallySaved} ${localTaskWriteMessage(copy, updated) ?? ''}`)
          return false
        }
      }
      pending.batchKey = batchKey
      pending.batchLabels = labels
      pending.batchPriorityWritten = batchPatch.priority !== undefined
      if (pending.criteriaUnsettled) {
        const unsettled = pending.criteriaUnsettled
        const settled = await sendLocalTaskWrite(
          ids.criteria,
          { taskId: unsettled.taskId, patch: { criteria: unsettled.criteria } },
          api.updateTask
        )
        if (settled.kind !== 'ok') {
          if (settled.kind !== 'unknown') {
            pending.criteriaUnsettled = null
          }
          setError(`${copy.subtasksPartiallySaved} ${localTaskWriteMessage(copy, settled) ?? ''}`)
          return false
        }
        library.acceptTasks([settled.value.task])
        pending.criteriaDone += 1
        pending.criteriaUnsettled = null
      }
      const criteria = localTaskDraftTexts(draft.criteria)
      const criteriaKey = JSON.stringify(criteria)
      if (pending.criteriaKey !== criteriaKey) {
        pending.criteriaClearing =
          criteria.length === 0 && pending.criteriaKey !== null && pending.criteriaKey !== '[]'
        pending.criteriaDone = 0
        pending.criteriaKey = criteriaKey
      }
      while (
        pending.criteriaDone < pending.tasks.length &&
        (criteria.length > 0 || pending.criteriaClearing)
      ) {
        const task = pending.tasks[pending.criteriaDone]
        const updated = await sendLocalTaskWrite(
          ids.criteria,
          { taskId: task.id, patch: { criteria } },
          api.updateTask
        )
        if (updated.kind !== 'ok') {
          if (updated.kind === 'unknown') {
            pending.criteriaUnsettled = { taskId: task.id, criteria }
          }
          setError(`${copy.subtasksPartiallySaved} ${localTaskWriteMessage(copy, updated) ?? ''}`)
          return false
        }
        library.acceptTasks([updated.value.task])
        pending.criteriaDone += 1
      }
      pendingSubtasks.current = null
      subtaskIntent.current = null
      setSubtaskRetryPending(false)
      setPartialTaskId(null)
      return true
    })

  return {
    partialTaskId,
    subtaskRetryPending,
    createSubtasks,
    retrySubtasks: (parent: LocalTask, draft: LocalTaskDraft) => {
      const intent = subtaskIntent.current
      return intent ? createSubtasks(parent, intent.titles, draft) : Promise.resolve(false)
    }
  }
}
