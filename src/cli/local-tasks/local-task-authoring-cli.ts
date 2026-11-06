import { LOCAL_TASK_DESCRIPTION_MAX } from '../../shared/local-tasks/local-task-model'
import type { LocalTaskProject } from '../../shared/local-tasks/local-task-types'
import { readCommandBody } from '../command-body-input'
import type { CommandHandler } from '../dispatch'
import { getOptionalStringFlag, getRepeatedStringFlag, getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime/types'
import { formatTaskChange, summarizeTask } from './local-task-cli-format'
import { writeTaskSuccess } from '../../shared/local-tasks/local-task-read-schemas'
import {
  describeTask,
  readTaskLibrary,
  resolveTaskRef,
  write,
  type TaskLibrary
} from './local-task-cli-library'

function words(flags: Map<string, string | boolean>, name: string, what: string): string {
  const text = getRepeatedStringFlag(flags, name).join(' ').trim()
  if (!text) {
    throw new RuntimeClientError('invalid_argument', `Pass the ${what}.`)
  }
  return text
}

function projectNamed(library: TaskLibrary, wanted: string | undefined): LocalTaskProject {
  const key = wanted?.trim().toLowerCase()
  const found = key
    ? library.projects.filter((project) =>
        [project.name, project.prefix, ...project.aliases].some(
          (name) => name.toLowerCase() === key
        )
      )
    : library.projects
  if (found.length === 1) {
    return found[0]
  }
  const names = library.projects.map((project) => `${project.name} (${project.prefix})`).join(', ')
  throw new RuntimeClientError(
    key ? 'not_found' : 'invalid_argument',
    key
      ? `No task project "${wanted}". Projects: ${names || 'none'}.`
      : `Name the project with --project, or create a subtask with --parent. Projects: ${names || 'none'}.`
  )
}

/** Recording and renaming tasks from an agent (REQ-022, REQ-025); completing stays in the UI. */
export const LOCAL_TASK_AUTHORING_CLI_HANDLERS: Record<string, CommandHandler> = {
  'task create': async ({ client, flags, json, cwd }) => {
    const title = words(flags, 'title', 'task title')
    const library = await readTaskLibrary(client, { access: 'write' })
    const parentRef = getOptionalStringFlag(flags, 'parent')
    const parent = parentRef ? resolveTaskRef(library, parentRef) : null
    const projectId = parent
      ? parent.task.projectId
      : projectNamed(library, getOptionalStringFlag(flags, 'project')).id
    const description = await readCommandBody(flags, cwd, {
      required: false,
      maximumCharacters: LOCAL_TASK_DESCRIPTION_MAX,
      tooLargeCode: 'invalid_argument',
      label: 'Description'
    })
    const { value, envelope } = await write(
      client,
      'localTasks.tasks.create',
      {
        projectId,
        title,
        ...(description ? { description } : {}),
        ...(parent ? { parentId: parent.task.id } : {})
      },
      writeTaskSuccess
    )
    printResult(
      {
        ...envelope,
        result: { task: summarizeTask(describeTask(library, value.task)), change: 'created' }
      },
      json,
      formatTaskChange
    )
  },
  'task update': async ({ client, flags, json }) => {
    const title = words(flags, 'title', 'new title')
    const library = await readTaskLibrary(client, { access: 'write' })
    const resolved = resolveTaskRef(library, getRequiredStringFlag(flags, 'ref'))
    const { value, envelope } = await write(
      client,
      'localTasks.tasks.update',
      { taskId: resolved.task.id, expectedRevision: resolved.task.revision, patch: { title } },
      writeTaskSuccess
    )
    printResult(
      {
        ...envelope,
        result: { task: summarizeTask(describeTask(library, value.task)), change: 'updated' }
      },
      json,
      formatTaskChange
    )
  }
}
