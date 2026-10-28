import { useEffect, useState } from 'react'
import type { LocalTaskLinks } from '../../../src/shared/local-tasks/local-task-link-types'
import type { LocalTask, LocalTaskProject } from '../../../src/shared/local-tasks/local-task-types'
import { taskRuntimeStatusRead } from '../tasks/mobile-task-runtime-operations'
import { scopeRpcClientToExecutionHost } from '../transport/execution-host-scoped-rpc-client'
import type { RpcClient } from '../transport/rpc-client'
import {
  projectSectionsRead,
  readServedProjectSections
} from '../worktree/project-sections-operations'
import { createLocalTasksApi } from './local-tasks-api'
import { hostAdvertisesLocalTasks } from './local-tasks-access'
import { localTasksCopy } from './local-tasks-copy'
import { LocalTaskChoiceSheet } from './local-task-choice-sheet'
import { localTaskEndpointFor, localTaskOwnerHostId } from './local-task-endpoint'
import { localTaskWriteMessage } from './local-task-failure-message'
import { localTaskStatusLookup } from './local-task-list-projection'
import { createLocalTaskOperationIds, sendLocalTaskWrite } from './local-task-operation-ids'
import { localTaskOrcaProjectForRepo } from './local-task-project-setups'
import {
  localTaskLinkHolding,
  localTaskLinkParamsFor,
  type LocalTaskWorkspaceCandidate
} from './local-task-workspace-candidates'

type Library = { projects: LocalTaskProject[]; tasks: LocalTask[]; links: LocalTaskLinks }

type Reading =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'unsupported' }
  | { status: 'ready'; library: Library; related: ReadonlySet<string> }

const CLOSED_CATEGORIES = new Set(['completed', 'canceled'])

/**
 * Open tasks of any level, those of the projects linked to the workspace's repo first (REQ-011).
 * A task that already has a workspace is listed greyed out.
 */
export function localTaskLinkChoices(library: Library, related: ReadonlySet<string>): LocalTask[] {
  const statuses = localTaskStatusLookup(library.projects)
  return library.tasks
    .filter((task) => !CLOSED_CATEGORIES.has(statuses.get(task.statusId)?.category ?? ''))
    .sort(
      (a, b) =>
        Number(related.has(b.projectId)) - Number(related.has(a.projectId)) || b.number - a.number
    )
}

/**
 * "Link to task…" for one workspace, in the library of the Orca that owns it (D-008): the paired
 * host's own, or a server's through the paired host. Everything is read once, when the sheet opens.
 */
export function LocalTaskLinkToTaskSheet(props: {
  /** The workspace with its host as the phone lists it (`runtime:E` for a server's). */
  target: LocalTaskWorkspaceCandidate | null
  hostLabel: string
  /** The paired host's client. */
  client: RpcClient | null
  onLinked?: () => void
  onClose: () => void
}) {
  const copy = localTasksCopy()
  const [reading, setReading] = useState<Reading>({ status: 'loading' })
  const [ids] = useState(() => createLocalTaskOperationIds())
  const [error, setError] = useState<string | null>(null)
  const { target, client } = props
  const endpoint = localTaskEndpointFor(target?.hostId)
  const ownerHostId = target ? localTaskOwnerHostId(endpoint, target.hostId) : null
  const libraryClient =
    client && endpoint.executionHost
      ? scopeRpcClientToExecutionHost(client, endpoint.executionHost)
      : client
  useEffect(() => {
    if (!target || !client || !libraryClient) {
      return
    }
    let current = true
    setReading({ status: 'loading' })
    const api = createLocalTasksApi(libraryClient)
    // Why asked here: the host screen only knows the paired host advertises tasks, not the server.
    const supported = endpoint.executionHost
      ? taskRuntimeStatusRead
          .requestSingleFlight(libraryClient, endpoint.executionHost)
          .then((reply) =>
            hostAdvertisesLocalTasks(taskRuntimeStatusRead.interpret(reply).capabilities)
          )
      : Promise.resolve(true)
    supported
      .then(async (advertises) => {
        if (!advertises) {
          return null
        }
        const [projects, tasks, links, sections] = await Promise.all([
          api.projects(),
          api.tasks(),
          api.links(),
          projectSectionsRead.request(client).catch(() => null)
        ])
        return { projects, tasks, links, sections }
      })
      .then(
        (read) => {
          if (!current) {
            return
          }
          if (!read) {
            setReading({ status: 'unsupported' })
            return
          }
          const served = readServedProjectSections(read.sections)
          const catalog = served.kind === 'answered' ? served.value : null
          const orcaProjectId = catalog ? localTaskOrcaProjectForRepo(catalog, target.repoId) : null
          setReading({
            status: 'ready',
            library: { projects: read.projects, tasks: read.tasks, links: read.links },
            related: new Set(
              read.projects
                .filter((project) => orcaProjectId && project.repos.includes(orcaProjectId))
                .map((project) => project.id)
            )
          })
        },
        () => current && setReading({ status: 'failed' })
      )
    return () => {
      current = false
    }
  }, [target, client, libraryClient, endpoint.executionHost])

  const ready = reading.status === 'ready' ? reading : null
  const ownTarget = target && ownerHostId ? { ...target, hostId: ownerHostId } : null
  const holder = ready && ownTarget ? localTaskLinkHolding(ready.library.links, ownTarget) : null
  const holderRef = holder
    ? ready?.library.tasks.find((task) => task.id === holder.taskId)?.ref
    : null
  const tasks = ready ? localTaskLinkChoices(ready.library, ready.related) : []
  const link = async (task: LocalTask) => {
    if (!ownTarget || !libraryClient) {
      return
    }
    const outcome = await sendLocalTaskWrite(
      ids,
      {
        taskId: task.id,
        ...localTaskLinkParamsFor(ownTarget, props.hostLabel),
        linkedVia: 'manual' as const
      },
      createLocalTasksApi(libraryClient).linkWorkspace
    )
    setError(localTaskWriteMessage(copy, outcome))
    if (outcome.kind === 'ok') {
      props.onLinked?.()
      props.onClose()
    }
  }
  const message =
    reading.status === 'failed'
      ? copy.loadFailed
      : reading.status === 'unsupported' || (target && !ownerHostId)
        ? copy.unsupported
        : holderRef
          ? copy.work.workspaceTaken(holderRef)
          : ready && tasks.length === 0
            ? copy.work.noOpenTasks
            : null
  return (
    <LocalTaskChoiceSheet
      visible={target !== null}
      title={copy.work.linkToTaskTitle}
      loading={target !== null && reading.status === 'loading'}
      message={message}
      error={error}
      choices={tasks.map((task) => {
        const held = ready?.library.links.workspaces.find((entry) => entry.taskId === task.id)
        return {
          key: task.id,
          label: `${task.ref} · ${task.title}`,
          subtitle: held ? copy.work.hasWorkspace(held.nameSnapshot ?? '') : undefined,
          disabled: held !== undefined || holder !== null,
          onPress: () => void link(task)
        }
      })}
      onClose={() => {
        setError(null)
        props.onClose()
      }}
    />
  )
}
