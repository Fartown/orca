import type { LocalTaskPriority } from '../../shared/local-tasks/local-task-model'
import type {
  LocalTaskSessionLink,
  LocalTaskWorkspaceLink
} from '../../shared/local-tasks/local-task-link-types'
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

/** A row of `orca task list`: enough for the dispatcher to see who owns which workspace. */
export type TaskCliListItem = TaskCliSummary & {
  workspace: { hostId: string; name: string | null; worktreeId: string | null } | null
  latestProgress: { at: string; body: string } | null
}

export type TaskCliDetail = TaskCliSummary & {
  description: string
  workspace: {
    hostId: string
    kind: LocalTaskWorkspaceLink['kind']
    name: string | null
    branch: string | null
    /** What a proposal's `target.worktreeId` names. */
    worktreeId: string | null
  } | null
  /** The agent's newest writeback (REQ-022). */
  latestProgress: { at: string; body: string; needsYou: string | null } | null
  /** Sessions on the task; a proposal's append or stop names one by `sessionLinkId`. */
  sessions: { sessionLinkId: string; agent: string | null; surface: string; openedAt: string }[]
}

/** UTC with the date, so an agent never guesses the zone. */
export function cliTime(at: number): string {
  return `${new Date(at).toISOString().slice(0, 16).replace('T', ' ')}Z`
}

/**
 * Text people, agents or outside sources wrote, fenced so an agent reads it as data, never as an
 * instruction (H5). Why JSON quoting: a quote or newline inside cannot end the quote.
 */
export function quotedCliText(text: string): string {
  return JSON.stringify(text)
}

/** Several lines of such text, each behind "> " so no line of it can pass for the CLI's own. */
function quotedCliBlock(text: string): string[] {
  return text.split('\n').map((line) => `> ${line}`)
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
  link: LocalTaskWorkspaceLink | null,
  sessions: readonly LocalTaskSessionLink[] = []
): TaskCliDetail {
  const progress = resolved.task.latestProgress
  return {
    ...summarizeTask(resolved),
    description: resolved.task.description,
    workspace: link
      ? {
          hostId: link.hostId,
          kind: link.kind,
          name: link.nameSnapshot,
          branch: link.branchSnapshot,
          worktreeId: link.worktreeId
        }
      : null,
    latestProgress: progress
      ? { at: cliTime(progress.at), body: progress.body, needsYou: progress.needsYou ?? null }
      : null,
    sessions: sessions
      .filter((session) => session.taskId === resolved.task.id)
      .map((session) => ({
        sessionLinkId: session.id,
        agent: session.agent,
        surface: session.surface,
        openedAt: cliTime(session.openedAt)
      }))
  }
}

function contextLine(task: TaskCliSummary): string {
  return [task.ref, task.status, task.project].filter(Boolean).join(' · ')
}

/** The progress line is cut to its first line; `orca task show` has the whole writeback. */
const LIST_PROGRESS_MAX = 160

export function listTask(
  resolved: ResolvedTask,
  link: LocalTaskWorkspaceLink | null
): TaskCliListItem {
  const progress = resolved.task.latestProgress
  const firstLine =
    progress?.body
      .split('\n')
      .find((line) => line.trim())
      ?.trim() ?? ''
  return {
    ...summarizeTask(resolved),
    workspace: link
      ? { hostId: link.hostId, name: link.nameSnapshot, worktreeId: link.worktreeId }
      : null,
    latestProgress: progress
      ? { at: cliTime(progress.at), body: firstLine.slice(0, LIST_PROGRESS_MAX) }
      : null
  }
}

export function formatTaskList(result: { tasks: TaskCliListItem[] }): string {
  return result.tasks.length
    ? result.tasks
        .map((task) => {
          const where = task.workspace?.name ? ` · ${task.workspace.name}` : ''
          const latest = task.latestProgress
            ? `\n  latest (${task.latestProgress.at}): ${quotedCliText(task.latestProgress.body)}`
            : ''
          return `${quotedCliText(task.title)}\t${contextLine(task)}${where}${latest}`
        })
        .join('\n')
    : 'No tasks.'
}

export function formatTaskDetail(task: TaskCliDetail): string {
  const lines = [quotedCliText(task.title), contextLine(task), `Priority: ${task.priority}`]
  if (task.labels.length > 0) {
    lines.push(`Labels: ${task.labels.map(quotedCliText).join(', ')}`)
  }
  if (task.workspace) {
    const name = task.workspace.name ?? task.workspace.branch ?? '(unnamed)'
    lines.push(`Workspace: ${name} on ${task.workspace.hostId}`)
  }
  if (task.description.trim()) {
    lines.push('', 'Description:', ...quotedCliBlock(task.description.trim()))
  }
  if (task.latestProgress) {
    lines.push(
      '',
      `Latest progress (${task.latestProgress.at}):`,
      ...quotedCliBlock(task.latestProgress.body.trim())
    )
    if (task.latestProgress.needsYou) {
      lines.push(`Needs the user: ${quotedCliText(task.latestProgress.needsYou)}`)
    }
  }
  if (task.sessions.length > 0) {
    lines.push(
      '',
      'Sessions (sessionLinkId · agent · opened):',
      ...task.sessions.map(
        (session) =>
          `- ${session.sessionLinkId} · ${session.agent ?? session.surface} · ${session.openedAt}`
      )
    )
  }
  return lines.join('\n')
}

export function formatTaskShow(result: { task: TaskCliDetail }): string {
  return formatTaskDetail(result.task)
}

export function formatTaskCurrent(result: {
  worktree: { id: string; name: string | null } | null
  task: TaskCliDetail | null
}): string {
  return result.task
    ? formatTaskDetail(result.task)
    : `${result.worktree?.name ?? result.worktree?.id ?? 'This session'} is not linked to a task.`
}

export function formatTaskChange(result: { task: TaskCliSummary; change: string }): string {
  return `${result.change}\t${quotedCliText(result.task.title)}\t${contextLine(result.task)}`
}
