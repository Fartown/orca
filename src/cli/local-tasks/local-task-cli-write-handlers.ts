import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import { findLocalTaskSessionForIdentity } from '../../shared/local-tasks/local-task-session-match'
import {
  LOCAL_TASK_DESCRIPTION_MAX,
  LOCAL_TASK_TITLE_MAX
} from '../../shared/local-tasks/local-task-model'
import type { CommandHandler } from '../dispatch'
import { readCommandBody } from '../command-body-input'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime/types'
import {
  createTask,
  describeTask,
  linkTaskWorkspace,
  readTaskLibrary,
  resolveTaskRef,
  updateTaskTitle
} from './local-task-cli-library'
import { formatTaskChange, summarizeTask } from './local-task-cli-format'
import { currentWorkspace } from './local-task-cli-workspace'

export const LOCAL_TASK_CLI_WRITE_HANDLERS: Record<string, CommandHandler> = {
  'task create': async ({ client, flags, json, cwd }) => {
    const title = getRequiredStringFlag(flags, 'title').trim()
    if (!title || title.length > LOCAL_TASK_TITLE_MAX) {
      throw new RuntimeClientError(
        'invalid_argument',
        `Title must be 1–${LOCAL_TASK_TITLE_MAX} characters.`
      )
    }
    const description = await readCommandBody(flags, cwd, {
      required: false,
      maximumCharacters: LOCAL_TASK_DESCRIPTION_MAX,
      tooLargeCode: 'invalid_argument',
      label: 'Description'
    })
    const library = await readTaskLibrary(client, { access: 'write', links: true })
    const parentRef = getOptionalStringFlag(flags, 'parent')
    const parent = parentRef ? resolveTaskRef(library, parentRef).task : null
    const projectName = getOptionalStringFlag(flags, 'project')
    const matchingProjects = projectName
      ? library.projects.filter((project) =>
          [project.name, project.prefix, ...project.aliases].some(
            (name) => name.toLowerCase() === projectName.toLowerCase()
          )
        )
      : []
    const session = findLocalTaskSessionForIdentity(library.links, {
      paneKey: process.env.ORCA_PANE_KEY,
      sessionId: process.env.ORCA_AGENT_SESSION_ID,
      tabId: process.env.ORCA_TAB_ID
    })
    const sessionTask = session ? library.tasks.find((task) => task.id === session.taskId) : null
    const projectId =
      parent?.projectId ??
      matchingProjects[0]?.id ??
      sessionTask?.projectId ??
      (library.projects.length === 1 ? library.projects[0].id : null)
    if (!projectId || (projectName && matchingProjects.length !== 1)) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Pass --project <name-or-prefix> to choose the task project.'
      )
    }
    const { task, envelope } = await createTask(client, projectId, title, description, parent?.id)
    printResult(
      {
        ...envelope,
        result: { task: summarizeTask(describeTask(library, task)), change: 'created' }
      },
      json,
      formatTaskChange
    )
  },
  'task update': async ({ client, flags, json }) => {
    const title = getRequiredStringFlag(flags, 'title').trim()
    if (!title || title.length > LOCAL_TASK_TITLE_MAX) {
      throw new RuntimeClientError(
        'invalid_argument',
        `Title must be 1–${LOCAL_TASK_TITLE_MAX} characters.`
      )
    }
    const library = await readTaskLibrary(client, { access: 'write' })
    const resolved = resolveTaskRef(library, getRequiredStringFlag(flags, 'ref'))
    const { task, envelope } = await updateTaskTitle(client, resolved, title)
    printResult(
      {
        ...envelope,
        result: { task: summarizeTask(describeTask(library, task)), change: 'updated' }
      },
      json,
      formatTaskChange
    )
  },
  'task link': async (context) => {
    const library = await readTaskLibrary(context.client, { access: 'write' })
    const resolved = resolveTaskRef(library, getRequiredStringFlag(context.flags, 'ref'))
    const worktree = await currentWorkspace(context)
    const envelope = await linkTaskWorkspace(context.client, resolved.task.id, {
      hostId: worktree.hostId ?? LOCAL_EXECUTION_HOST_ID,
      worktreeId: worktree.id,
      ...(worktree.instanceId ? { instanceId: worktree.instanceId } : {}),
      ...(worktree.repoId ? { repoId: worktree.repoId } : {}),
      ...(worktree.branch ? { branchSnapshot: worktree.branch } : {}),
      ...(worktree.displayName ? { nameSnapshot: worktree.displayName } : {})
    })
    printResult(
      { ...envelope, result: { task: summarizeTask(resolved), change: 'linked' } },
      context.json,
      formatTaskChange
    )
  }
}
