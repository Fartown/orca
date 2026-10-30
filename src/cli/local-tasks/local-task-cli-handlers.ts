import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import { findLocalTaskLinkForWorkspace } from '../../shared/local-tasks/local-task-workspace-match'
import type { LocalTask } from '../../shared/local-tasks/local-task-types'
import type { RuntimeWorktreeRecord } from '../../shared/runtime-types'
import type { CommandHandler, HandlerContext } from '../dispatch'
import { getOptionalStringFlag, getRepeatedStringFlag, getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime/types'
import { getOptionalWorktreeSelector, resolveCurrentWorktreeSelector } from '../selectors'
import {
  addTaskComment,
  describeTask,
  readTaskLibrary,
  resolveTaskRef,
  resolveTaskStatus,
  setTaskStatus,
  type TaskLibrary
} from './local-task-cli-library'
import {
  detailTask,
  formatTaskChange,
  formatTaskCurrent,
  formatTaskList,
  formatTaskShow,
  summarizeTask
} from './local-task-cli-format'

function requiredWords(flags: HandlerContext['flags'], name: string, what: string): string {
  const text = getRepeatedStringFlag(flags, name).join(' ').trim()
  if (!text) {
    throw new RuntimeClientError('invalid_argument', `Pass the ${what}.`)
  }
  return text
}

function projectFilter(library: TaskLibrary, wanted: string): (task: LocalTask) => boolean {
  const key = wanted.trim().toLowerCase()
  const ids = new Set(
    library.projects
      .filter((project) =>
        [project.name, project.prefix, ...project.aliases].some(
          (name) => name.toLowerCase() === key
        )
      )
      .map((project) => project.id)
  )
  if (ids.size === 0) {
    throw new RuntimeClientError(
      'not_found',
      `No task project "${wanted}". Projects: ${library.projects.map((project) => `${project.name} (${project.prefix})`).join(', ') || 'none'}.`
    )
  }
  return (task) => ids.has(task.projectId)
}

/** A status name in any case, or a category such as `started` that covers every project's name. */
function statusFilter(library: TaskLibrary, wanted: string): (task: LocalTask) => boolean {
  const key = wanted.trim().toLowerCase()
  const ids = new Set(
    library.projects
      .flatMap((project) => project.statuses)
      .filter((status) => status.name.toLowerCase() === key || status.category === key)
      .map((status) => status.id)
  )
  if (ids.size === 0) {
    throw new RuntimeClientError('invalid_argument', `No status or category "${wanted}".`)
  }
  return (task) => ids.has(task.statusId)
}

async function currentWorkspace(context: HandlerContext): Promise<RuntimeWorktreeRecord> {
  const { flags, client, cwd } = context
  const explicit = await getOptionalWorktreeSelector(flags, 'worktree', cwd, client)
  if (!explicit && client.isRemote) {
    throw new RuntimeClientError(
      'invalid_argument',
      'orca task current reads this directory’s workspace; on a paired host pass --worktree <selector>.'
    )
  }
  const selector = explicit ?? (await resolveCurrentWorktreeSelector(cwd, client))
  const { result } = await client.call<{ worktree: RuntimeWorktreeRecord }>('worktree.show', {
    worktree: selector
  })
  return result.worktree
}

export const LOCAL_TASK_CLI_HANDLERS: Record<string, CommandHandler> = {
  'task list': async ({ client, flags, json }) => {
    const library = await readTaskLibrary(client)
    const project = getOptionalStringFlag(flags, 'project')
    const status = getOptionalStringFlag(flags, 'status')
    const filters = [
      ...(project ? [projectFilter(library, project)] : []),
      ...(status ? [statusFilter(library, status)] : [])
    ]
    const tasks = library.tasks
      .filter((task) => filters.every((matches) => matches(task)))
      .map((task) => summarizeTask(describeTask(library, task)))
    printResult({ ...library.envelope, result: { tasks } }, json, formatTaskList)
  },
  'task show': async ({ client, flags, json }) => {
    const library = await readTaskLibrary(client, { links: true })
    const resolved = resolveTaskRef(library, getRequiredStringFlag(flags, 'ref'))
    const link = library.links.workspaces.find((candidate) => candidate.taskId === resolved.task.id)
    printResult(
      { ...library.envelope, result: { task: detailTask(resolved, link ?? null) } },
      json,
      formatTaskShow
    )
  },
  'task current': async (context) => {
    const [worktree, library] = await Promise.all([
      currentWorkspace(context),
      readTaskLibrary(context.client, { links: true })
    ])
    // Why the runtime's own host id: links and its catalog both spell hosts relative to that Orca.
    const link = findLocalTaskLinkForWorkspace(library.links, {
      id: worktree.id,
      hostId: worktree.hostId ?? LOCAL_EXECUTION_HOST_ID,
      ...(worktree.instanceId ? { instanceId: worktree.instanceId } : {})
    })
    const task = link ? library.tasks.find((candidate) => candidate.id === link.taskId) : undefined
    printResult(
      {
        ...library.envelope,
        result: {
          worktree: { id: worktree.id, name: worktree.displayName || null },
          task: task && link ? detailTask(describeTask(library, task), link) : null
        }
      },
      context.json,
      formatTaskCurrent
    )
  },
  'task comment': async ({ client, flags, json }) => {
    const body = requiredWords(flags, 'body', 'comment text')
    const library = await readTaskLibrary(client, { access: 'write' })
    const resolved = resolveTaskRef(library, getRequiredStringFlag(flags, 'ref'))
    const envelope = await addTaskComment(client, resolved, body)
    printResult(
      { ...envelope, result: { task: summarizeTask(resolved), change: 'commented' } },
      json,
      formatTaskChange
    )
  },
  'task status': async ({ client, flags, json }) => {
    const name = requiredWords(flags, 'status', 'status name')
    const library = await readTaskLibrary(client, { access: 'write' })
    const resolved = resolveTaskRef(library, getRequiredStringFlag(flags, 'ref'))
    const status = resolveTaskStatus(resolved, name)
    if (status.id === resolved.task.statusId) {
      printResult(
        { ...library.envelope, result: { task: summarizeTask(resolved), change: 'unchanged' } },
        json,
        formatTaskChange
      )
      return
    }
    const { task, envelope } = await setTaskStatus(client, resolved, status)
    printResult(
      {
        ...envelope,
        result: { task: summarizeTask(describeTask(library, task)), change: 'updated' }
      },
      json,
      formatTaskChange
    )
  }
}
