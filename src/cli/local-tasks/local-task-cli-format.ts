import type { LocalTaskPriority } from '../../shared/local-tasks/local-task-model'
import type { LocalTaskWorkspaceLink } from '../../shared/local-tasks/local-task-link-types'
import type { ResolvedTask } from './local-task-cli-library'

/** One task as `orca task` prints it: the title leads, the ref is a detail (REQ-007). */
export type TaskCliSummary = {
  id: string
  title: string
  ref: string
  project: string | null
  status: string | null
  statusCategory: string | null
  priority: string
  labels: string[]
}

export type TaskCliDetail = TaskCliSummary & {
  description: string
  criteria: string[]
  workspace: {
    hostId: string
    kind: LocalTaskWorkspaceLink['kind']
    name: string | null
    branch: string | null
  } | null
}

const PRIORITY_LABELS: Record<LocalTaskPriority, string> = {
  0: 'No priority',
  1: 'Urgent',
  2: 'High',
  3: 'Medium',
  4: 'Low'
}

export function summarizeTask({ task, project, status }: ResolvedTask): TaskCliSummary {
  return {
    id: task.id,
    title: task.title,
    ref: task.ref,
    project: project?.name ?? null,
    status: status?.name ?? null,
    statusCategory: status?.category ?? null,
    priority: PRIORITY_LABELS[task.priority],
    labels: task.labels
  }
}

export function detailTask(
  resolved: ResolvedTask,
  link: LocalTaskWorkspaceLink | null
): TaskCliDetail {
  return {
    ...summarizeTask(resolved),
    description: resolved.task.description,
    criteria: resolved.task.criteria,
    workspace: link
      ? {
          hostId: link.hostId,
          kind: link.kind,
          name: link.nameSnapshot,
          branch: link.branchSnapshot
        }
      : null
  }
}

function contextLine(task: TaskCliSummary): string {
  return [task.ref, task.status, task.project].filter(Boolean).join(' · ')
}

export function formatTaskList(result: { tasks: TaskCliSummary[] }): string {
  return result.tasks.length
    ? result.tasks.map((task) => `${task.title}\t${contextLine(task)}`).join('\n')
    : 'No tasks.'
}

export function formatTaskDetail(task: TaskCliDetail): string {
  const lines = [task.title, contextLine(task), `Priority: ${task.priority}`]
  if (task.labels.length > 0) {
    lines.push(`Labels: ${task.labels.join(', ')}`)
  }
  if (task.workspace) {
    const name = task.workspace.name ?? task.workspace.branch ?? '(unnamed)'
    lines.push(`Workspace: ${name} on ${task.workspace.hostId}`)
  }
  if (task.description.trim()) {
    lines.push('', task.description.trim())
  }
  if (task.criteria.length > 0) {
    lines.push('', 'Done criteria:', ...task.criteria.map((item) => `- ${item}`))
  }
  return lines.join('\n')
}

export function formatTaskShow(result: { task: TaskCliDetail }): string {
  return formatTaskDetail(result.task)
}

export function formatTaskCurrent(result: {
  worktree: { id: string; name: string | null }
  task: TaskCliDetail | null
}): string {
  return result.task
    ? formatTaskDetail(result.task)
    : `${result.worktree.name ?? result.worktree.id} is not linked to a task.`
}

export function formatTaskChange(result: { task: TaskCliSummary; change: string }): string {
  return `${result.change}\t${result.task.title}\t${contextLine(result.task)}`
}
