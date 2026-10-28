import {
  LOCAL_TASK_LABEL_MAX,
  LOCAL_TASK_LABELS_MAX,
  LOCAL_TASK_TITLE_MAX,
  type LocalTaskPriority
} from '../../../src/shared/local-tasks/local-task-model'
import { localTaskDescendantIds } from '../../../src/shared/local-tasks/local-task-tree'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'

export type LocalTaskFormMode =
  | { kind: 'create'; projectId: string; statusId?: string }
  /** A subtask form: the parent is fixed and a multi-line title can become several subtasks. */
  | { kind: 'subtask'; parent: LocalTask }
  | { kind: 'edit'; task: LocalTask }

/** One editable line. The id is local to this form, so editing or removing a line keeps the rest. */
export type LocalTaskDraftEntry = { id: string; text: string }

let entrySequence = 0

export function newLocalTaskDraftEntry(text = ''): LocalTaskDraftEntry {
  entrySequence += 1
  return { id: `entry-${entrySequence}`, text }
}

export function localTaskDraftEntries(texts: readonly string[]): LocalTaskDraftEntry[] {
  return texts.map((text) => newLocalTaskDraftEntry(text))
}

export type LocalTaskDraft = {
  projectId: string
  title: string
  description: string
  criteria: LocalTaskDraftEntry[]
  /** Null leaves it to the desktop, which picks the project's first Unstarted status. */
  statusId: string | null
  priority: LocalTaskPriority
  labelsText: string
  parentId: string | null
  subtasks: LocalTaskDraftEntry[]
}

export function initialLocalTaskDraft(mode: LocalTaskFormMode): LocalTaskDraft {
  if (mode.kind === 'edit') {
    const { task } = mode
    return {
      projectId: task.projectId,
      title: task.title,
      description: task.description,
      criteria: localTaskDraftEntries(task.criteria),
      statusId: task.statusId,
      priority: task.priority,
      labelsText: task.labels.join(', '),
      parentId: task.parentId,
      subtasks: []
    }
  }
  const projectId = mode.kind === 'subtask' ? mode.parent.projectId : mode.projectId
  return {
    projectId,
    title: '',
    description: '',
    criteria: [],
    statusId: mode.kind === 'create' ? (mode.statusId ?? null) : null,
    priority: 0,
    labelsText: '',
    parentId: mode.kind === 'subtask' ? mode.parent.id : null,
    subtasks: []
  }
}

/** The non-empty lines of a paste, each a title the desktop accepts. */
export function splitPastedLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().slice(0, LOCAL_TASK_TITLE_MAX))
    .filter((line) => line.length > 0)
}

/**
 * Whether an edit is a paste of several lines rather than typing: React Native has no paste event,
 * so it is read off the change itself — more than one character arrived and it carries 2+ lines.
 */
export function isMultiLinePaste(previous: string, next: string): boolean {
  return next.length - previous.length > 1 && splitPastedLines(next).length > 1
}

export function parseLocalTaskLabels(text: string): string[] {
  const labels = text
    .split(/[,，、]/)
    .map((label) => label.trim().slice(0, LOCAL_TASK_LABEL_MAX))
    .filter((label) => label.length > 0)
  return [...new Set(labels)].slice(0, LOCAL_TASK_LABELS_MAX)
}

/** Back to the plain lines the desktop stores, blank ones dropped. */
export function localTaskDraftTexts(entries: readonly LocalTaskDraftEntry[]): string[] {
  return entries.map((entry) => entry.text.trim()).filter((text) => text.length > 0)
}

export function localTaskTitleOf(draft: LocalTaskDraft): string {
  return draft.title.replace(/\s*\r?\n\s*/g, ' ').trim()
}

export function createLocalTaskPayload(draft: LocalTaskDraft) {
  return {
    projectId: draft.projectId,
    title: localTaskTitleOf(draft),
    description: draft.description.trim(),
    criteria: localTaskDraftTexts(draft.criteria),
    ...(draft.statusId ? { statusId: draft.statusId } : {}),
    priority: draft.priority,
    labels: parseLocalTaskLabels(draft.labelsText),
    parentId: draft.parentId
  }
}

type LocalTaskPatch = {
  title?: string
  description?: string
  criteria?: string[]
  statusId?: string
  priority?: LocalTaskPriority
  labels?: string[]
  parentId?: string | null
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

/** Only what the user changed, so a concurrent edit to another field is not overwritten. */
export function localTaskPatchFor(draft: LocalTaskDraft, task: LocalTask): LocalTaskPatch {
  const patch: LocalTaskPatch = {}
  const title = localTaskTitleOf(draft)
  if (title !== task.title) {
    patch.title = title
  }
  if (draft.description.trim() !== task.description) {
    patch.description = draft.description.trim()
  }
  const criteria = localTaskDraftTexts(draft.criteria)
  if (!sameList(criteria, task.criteria)) {
    patch.criteria = criteria
  }
  if (draft.statusId && draft.statusId !== task.statusId) {
    patch.statusId = draft.statusId
  }
  if (draft.priority !== task.priority) {
    patch.priority = draft.priority
  }
  const labels = parseLocalTaskLabels(draft.labelsText)
  if (!sameList(labels, task.labels)) {
    patch.labels = labels
  }
  if (draft.parentId !== task.parentId) {
    patch.parentId = draft.parentId
  }
  return patch
}

/**
 * "Overwrite" after a stale save: the fields the user changed from the version they started on,
 * sent against the latest revision. A field only the other device changed is not in the patch, so
 * it survives the overwrite.
 */
export function localTaskOverwrite(draft: LocalTaskDraft, base: LocalTask, latest: LocalTask) {
  return { expectedRevision: latest.revision, patch: localTaskPatchFor(draft, base) }
}

/** What "Create more" keeps: the properties, not the content. */
export function nextLocalTaskDraft(draft: LocalTaskDraft): LocalTaskDraft {
  return { ...draft, title: '', description: '', criteria: [], subtasks: [] }
}

/**
 * Tasks of the project the task can be put under: any level (D-008), never itself or one of its
 * own descendants, which the host would refuse as a cycle.
 */
export function localTaskParentCandidates(
  tasks: readonly LocalTask[],
  projectId: string,
  editingId: string | undefined
): LocalTask[] {
  const childrenByParentId = new Map<string, LocalTask[]>()
  for (const task of tasks) {
    if (task.parentId) {
      childrenByParentId.set(task.parentId, [
        ...(childrenByParentId.get(task.parentId) ?? []),
        task
      ])
    }
  }
  const excluded = new Set(
    editingId ? [editingId, ...localTaskDescendantIds(editingId, childrenByParentId)] : []
  )
  return tasks.filter((task) => task.projectId === projectId && !excluded.has(task.id))
}
